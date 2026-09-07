import { validateTicketImport, planTicketImport, type TicketImportFile, type ImportContext } from '@shared/ticketImport'

const VALID_FILE = {
  meta: { project: 'orchestrator', feature_key: 'json-import', schema_version: '1.0.0' },
  epic: { id: 'EPIC-1', title: 'JSON Import', goal: 'Tickets importieren', owner: 'PM' },
  tickets: [
    {
      id: 'T-1',
      title: 'Zod-Schema bauen',
      type: 'feature',
      priority: 'high',
      status: 'open',
      assignee: 'Dev Agent',
      epic: 'EPIC-1',
      estimate_hours: 4,
      labels: ['backend'],
      depends_on: [],
      description: 'Schema in shared anlegen',
      acceptance_criteria: ['Validiert v1.x', 'Ignoriert unbekannte Felder'],
    },
    {
      id: 'T-2',
      title: 'IPC-Handler',
      type: 'task',
      status: 'in_progress',
      epic: 'EPIC-1',
      depends_on: ['T-1'],
    },
  ],
}

function makeContext(overrides: Partial<ImportContext> = {}): ImportContext {
  let counter = 0
  return {
    projectId: 'proj-1',
    existingByExternalId: new Map(),
    agents: [{ id: 'agent-1', name: 'Dev Agent' }],
    nextTicketNumber: 10,
    now: '2026-06-10T12:00:00.000Z',
    generateId: () => `local-${++counter}`,
    ...overrides,
  }
}

describe('validateTicketImport (Zod)', () => {
  it('accepts a valid v1 file', () => {
    const result = validateTicketImport(VALID_FILE)
    expect(result.success).toBe(true)
  })

  it('rejects unsupported schema_version', () => {
    const file = { ...VALID_FILE, meta: { ...VALID_FILE.meta, schema_version: '2.0.0' } }
    const result = validateTicketImport(file)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('meta.schema_version'))).toBe(true)
    }
  })

  it('rejects tickets without title and reports a readable path', () => {
    const file = {
      ...VALID_FILE,
      tickets: [{ id: 'T-1' }],
    }
    const result = validateTicketImport(file)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.startsWith('tickets.0.title'))).toBe(true)
    }
  })

  it('rejects empty ticket list and non-JSON shapes', () => {
    expect(validateTicketImport({ ...VALID_FILE, tickets: [] }).success).toBe(false)
    expect(validateTicketImport('nope').success).toBe(false)
    expect(validateTicketImport(null).success).toBe(false)
  })

  it('ignores unknown fields instead of failing', () => {
    const file = {
      ...VALID_FILE,
      future_field: 'whatever',
      tickets: [{ id: 'T-1', title: 'X', some_new_field: 42 }],
    }
    const result = validateTicketImport(file)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data.tickets[0] as Record<string, unknown>).some_new_field).toBeUndefined()
    }
  })
})

describe('planTicketImport — Upsert-Logik', () => {
  it('inserts new tickets including the epic as category "epic"', () => {
    const data = validateTicketImport(VALID_FILE) as { success: true; data: TicketImportFile }
    const plan = planTicketImport(data.data, makeContext())

    expect(plan.inserts).toHaveLength(3) // Epic + 2 Tickets
    expect(plan.updates).toHaveLength(0)

    const epic = plan.inserts.find((t) => t.externalId === 'EPIC-1')!
    expect(epic.category).toBe('epic')
    expect(epic.title).toBe('JSON Import')

    const t1 = plan.inserts.find((t) => t.externalId === 'T-1')!
    expect(t1.status).toBe('open')
    expect(t1.epicId).toBe(epic.id)
    expect(t1.ticketNumber).toBe(11) // Epic bekommt 10
    expect(t1.description).toContain('Akzeptanzkriterien')
    expect(t1.description).toContain('Validiert v1.x')

    const t2 = plan.inserts.find((t) => t.externalId === 'T-2')!
    expect(t2.status).toBe('in_progress')
  })

  it('updates existing tickets by external id without touching status', () => {
    const data = (validateTicketImport(VALID_FILE) as { success: true; data: TicketImportFile }).data
    const ctx = makeContext({
      existingByExternalId: new Map([
        ['EPIC-1', 'existing-epic'],
        ['T-1', 'existing-t1'],
      ]),
    })
    const plan = planTicketImport(data, ctx)

    expect(plan.updates).toHaveLength(2)
    expect(plan.inserts).toHaveLength(1) // nur T-2 ist neu

    const t1Update = plan.updates.find((u) => u.id === 'existing-t1')!
    expect(t1Update.updates.title).toBe('Zod-Schema bauen')
    expect(t1Update.updates.status).toBeUndefined()
    expect(t1Update.updates.epicId).toBe('existing-epic')
  })

  it('matches assignee case-insensitively, warns and leaves unassigned on miss', () => {
    const data = (validateTicketImport(VALID_FILE) as { success: true; data: TicketImportFile }).data
    const ctx = makeContext({ agents: [{ id: 'agent-1', name: 'DEV AGENT' }] })
    const plan = planTicketImport(data, ctx)

    const t1 = plan.inserts.find((t) => t.externalId === 'T-1')!
    expect(t1.assignedAgentLocalId).toBe('agent-1')

    const noMatch = planTicketImport(data, makeContext({ agents: [] }))
    const t1b = noMatch.inserts.find((t) => t.externalId === 'T-1')!
    expect(t1b.assignedAgentLocalId).toBeUndefined()
    expect(noMatch.warnings.some((w) => w.ticketId === 'T-1' && w.message.includes('Assignee'))).toBe(true)
  })

  it('warns on unknown status/type and falls back to defaults', () => {
    const data = (validateTicketImport({
      ...VALID_FILE,
      tickets: [{ id: 'T-X', title: 'X', type: 'weird', status: 'blocked' }],
    }) as { success: true; data: TicketImportFile }).data
    const plan = planTicketImport(data, makeContext())

    const t = plan.inserts.find((i) => i.externalId === 'T-X')!
    expect(t.status).toBe('open')
    expect(t.category).toBe('task')
    expect(plan.warnings.filter((w) => w.ticketId === 'T-X')).toHaveLength(2)
  })
})

describe('planTicketImport — Dependency-Auflösung', () => {
  it('resolves depends_on to local ids after all tickets are planned', () => {
    const data = (validateTicketImport(VALID_FILE) as { success: true; data: TicketImportFile }).data
    const plan = planTicketImport(data, makeContext())

    const t1 = plan.inserts.find((t) => t.externalId === 'T-1')!
    const t2 = plan.inserts.find((t) => t.externalId === 'T-2')!
    const dep = plan.dependencies.find((d) => d.ticketId === t2.id)!
    expect(dep.dependsOnIds).toEqual([t1.id])
  })

  it('resolves forward references (dependency declared before its target)', () => {
    const data = (validateTicketImport({
      ...VALID_FILE,
      tickets: [
        { id: 'T-A', title: 'A', depends_on: ['T-B'] },
        { id: 'T-B', title: 'B' },
      ],
    }) as { success: true; data: TicketImportFile }).data
    const plan = planTicketImport(data, makeContext())

    const tA = plan.inserts.find((t) => t.externalId === 'T-A')!
    const tB = plan.inserts.find((t) => t.externalId === 'T-B')!
    expect(plan.dependencies.find((d) => d.ticketId === tA.id)!.dependsOnIds).toEqual([tB.id])
  })

  it('resolves dependencies against tickets that already exist in the DB', () => {
    const data = (validateTicketImport({
      ...VALID_FILE,
      tickets: [{ id: 'T-NEW', title: 'Neu', depends_on: ['T-OLD'] }],
    }) as { success: true; data: TicketImportFile }).data
    const plan = planTicketImport(data, makeContext({
      existingByExternalId: new Map([['T-OLD', 'local-old']]),
    }))

    const tNew = plan.inserts.find((t) => t.externalId === 'T-NEW')!
    expect(plan.dependencies.find((d) => d.ticketId === tNew.id)!.dependsOnIds).toEqual(['local-old'])
  })

  it('skips unknown dependencies with a warning', () => {
    const data = (validateTicketImport({
      ...VALID_FILE,
      tickets: [{ id: 'T-1', title: 'X', depends_on: ['T-MISSING'] }],
    }) as { success: true; data: TicketImportFile }).data
    const plan = planTicketImport(data, makeContext())

    const t1 = plan.inserts.find((t) => t.externalId === 'T-1')!
    expect(plan.dependencies.find((d) => d.ticketId === t1.id)!.dependsOnIds).toEqual([])
    expect(plan.warnings.some((w) => w.message.includes('T-MISSING'))).toBe(true)
  })
})

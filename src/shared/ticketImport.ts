import { z } from 'zod'
import type { Ticket, TicketCategory, TicketStatus } from './types'

// ── JSON Schema (v1.x) ───────────────────────────────────────────────────────
// Zod strips unknown keys by default — unbekannte Felder werden ignoriert,
// bekannte Felder werden strikt validiert.

const importTicketSchema = z.object({
  id: z.string().min(1, 'Ticket-ID darf nicht leer sein'),
  title: z.string().min(1, 'Titel darf nicht leer sein'),
  type: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  assignee: z.string().optional(),
  role: z.string().optional(),
  epic: z.string().optional(),
  estimate_hours: z.number().nonnegative().optional(),
  labels: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  description: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  technical_notes: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  definition_of_done: z.array(z.string()).optional(),
})

export const ticketImportFileSchema = z.object({
  meta: z.object({
    project: z.string().optional(),
    feature_key: z.string().optional(),
    schema_version: z.string().regex(/^1\.\d+\.\d+$/, 'Nicht unterstützte Schema-Version (erwartet 1.x.x)'),
  }),
  epic: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    goal: z.string().optional(),
    owner: z.string().optional(),
  }).optional(),
  tickets: z.array(importTicketSchema).min(1, 'Mindestens ein Ticket erforderlich'),
})

export type TicketImportFile = z.infer<typeof ticketImportFileSchema>
export type ImportTicket = z.infer<typeof importTicketSchema>

// ── Validierung ──────────────────────────────────────────────────────────────

export type ValidationResult =
  | { success: true; data: TicketImportFile }
  | { success: false; errors: string[] }

export function validateTicketImport(raw: unknown): ValidationResult {
  const result = ticketImportFileSchema.safeParse(raw)
  if (result.success) return { success: true, data: result.data }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
  return { success: false, errors }
}

// ── Import-Planung (pure, DB-frei → testbar) ────────────────────────────────

export interface ImportWarning {
  ticketId?: string
  message: string
}

export interface TicketUpdatePlan {
  /** Lokale Ticket-ID */
  id: string
  updates: Partial<Ticket>
}

export interface TicketDependencyPlan {
  /** Lokale Ticket-ID */
  ticketId: string
  /** Lokale Ticket-IDs der Abhängigkeiten */
  dependsOnIds: string[]
}

export interface ImportPlan {
  inserts: Ticket[]
  updates: TicketUpdatePlan[]
  dependencies: TicketDependencyPlan[]
  warnings: ImportWarning[]
}

export interface ImportResult {
  success: boolean
  canceled?: boolean
  imported?: number
  updated?: number
  warnings?: ImportWarning[]
  errors?: string[]
}

export interface ImportContext {
  projectId: string
  /** Externe ID → lokale Ticket-ID bereits vorhandener Tickets */
  existingByExternalId: Map<string, string>
  agents: { id: string; name: string }[]
  nextTicketNumber: number
  now: string
  generateId: () => string
}

const STATUS_MAP: Record<string, TicketStatus> = {
  open: 'open',
  todo: 'open',
  backlog: 'open',
  new: 'open',
  in_progress: 'in_progress',
  doing: 'in_progress',
  active: 'in_progress',
  in_review: 'in_progress',
  done: 'done',
  closed: 'done',
  resolved: 'done',
  completed: 'done',
}

const CATEGORY_VALUES: TicketCategory[] = ['bug', 'feature', 'task', 'improvement', 'documentation', 'question', 'epic']

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function htmlSection(title: string, items: string[] | undefined, asCode = false): string {
  if (!items || items.length === 0) return ''
  const lis = items.map((i) => `<li>${asCode ? `<code>${escapeHtml(i)}</code>` : escapeHtml(i)}</li>`).join('')
  return `<h3>${title}</h3><ul>${lis}</ul>`
}

/** Rendert die strukturierten Felder als HTML — das Format, das das bestehende Ticket-Detail-UI (RichTextEditor) anzeigt. */
export function renderTicketDescriptionHtml(t: ImportTicket): string | undefined {
  const parts: string[] = []
  if (t.description) {
    parts.push(t.description.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''))
  }
  const metaBits: string[] = []
  if (t.priority) metaBits.push(`Priorität: ${escapeHtml(t.priority)}`)
  if (t.role) metaBits.push(`Rolle: ${escapeHtml(t.role)}`)
  if (t.estimate_hours !== undefined) metaBits.push(`Aufwand: ${t.estimate_hours}h`)
  if (t.labels && t.labels.length > 0) metaBits.push(`Labels: ${t.labels.map(escapeHtml).join(', ')}`)
  if (metaBits.length > 0) parts.push(`<p><strong>${metaBits.join(' · ')}</strong></p>`)
  parts.push(htmlSection('Akzeptanzkriterien', t.acceptance_criteria))
  parts.push(htmlSection('Technische Hinweise', t.technical_notes))
  parts.push(htmlSection('Dateien', t.files, true))
  parts.push(htmlSection('Definition of Done', t.definition_of_done))
  const html = parts.filter(Boolean).join('')
  return html || undefined
}

function mapStatus(raw: string | undefined, externalId: string, warnings: ImportWarning[]): TicketStatus {
  if (!raw) return 'open'
  const mapped = STATUS_MAP[raw.toLowerCase()]
  if (!mapped) {
    warnings.push({ ticketId: externalId, message: `Unbekannter Status "${raw}" — auf "open" gesetzt` })
    return 'open'
  }
  return mapped
}

function mapCategory(raw: string | undefined, externalId: string, warnings: ImportWarning[]): TicketCategory {
  if (!raw) return 'task'
  const lower = raw.toLowerCase() as TicketCategory
  if (CATEGORY_VALUES.includes(lower)) return lower
  warnings.push({ ticketId: externalId, message: `Unbekannter Typ "${raw}" — auf "task" gesetzt` })
  return 'task'
}

function matchAgent(assignee: string | undefined, ctx: ImportContext, externalId: string, warnings: ImportWarning[]): { id: string; name: string } | null {
  if (!assignee) return null
  const match = ctx.agents.find((a) => a.name.toLowerCase() === assignee.toLowerCase())
  if (!match) {
    warnings.push({ ticketId: externalId, message: `Kein Projekt-Agent für Assignee "${assignee}" gefunden — Ticket bleibt unzugewiesen` })
    return null
  }
  return match
}

/**
 * Berechnet den Import-Plan: Upsert per externer ID (existiert → Update ohne
 * Status, sonst Insert), Epic als Ticket vom Typ "epic", depends_on als
 * Relation (nach Auflösung aller Tickets).
 */
export function planTicketImport(data: TicketImportFile, ctx: ImportContext): ImportPlan {
  const warnings: ImportWarning[] = []
  const inserts: Ticket[] = []
  const updates: TicketUpdatePlan[] = []
  let ticketNumber = ctx.nextTicketNumber
  const now = ctx.now

  // Externe ID → lokale ID (vorhandene + neu geplante Tickets)
  const localIdByExternal = new Map(ctx.existingByExternalId)

  const upsert = (externalId: string, fresh: Omit<Ticket, 'id' | 'ticketNumber' | 'createdAt' | 'comments'>, updatable: Partial<Ticket>): string => {
    const existingId = localIdByExternal.get(externalId)
    if (existingId) {
      // Update: Status bewusst NICHT überschreiben
      updates.push({ id: existingId, updates: { ...updatable, updatedAt: now } })
      return existingId
    }
    const localId = ctx.generateId()
    inserts.push({
      ...fresh,
      id: localId,
      ticketNumber: ticketNumber++,
      comments: [],
      createdAt: now,
    })
    localIdByExternal.set(externalId, localId)
    return localId
  }

  // Epic als Ticket vom Typ "epic" anlegen/aktualisieren
  let epicLocalId: string | undefined
  if (data.epic) {
    const epicDescParts: string[] = []
    if (data.epic.goal) epicDescParts.push(`<p>${escapeHtml(data.epic.goal)}</p>`)
    if (data.epic.owner) epicDescParts.push(`<p><strong>Owner: ${escapeHtml(data.epic.owner)}</strong></p>`)
    const epicDescription = epicDescParts.join('') || undefined
    epicLocalId = upsert(data.epic.id, {
      projectId: ctx.projectId,
      title: data.epic.title,
      description: epicDescription,
      status: 'open',
      category: 'epic',
      sortOrder: Date.parse(now),
      externalId: data.epic.id,
      updatedAt: now,
    }, {
      title: data.epic.title,
      description: epicDescription,
      category: 'epic',
      externalId: data.epic.id,
    })
  }

  for (const [index, t] of data.tickets.entries()) {
    const category = mapCategory(t.type, t.id, warnings)
    const agent = matchAgent(t.assignee, ctx, t.id, warnings)
    const description = renderTicketDescriptionHtml(t)

    let epicId: string | undefined
    if (t.epic) {
      if (data.epic && t.epic === data.epic.id) {
        epicId = epicLocalId
      } else {
        const known = localIdByExternal.get(t.epic)
        if (known) {
          epicId = known
        } else {
          warnings.push({ ticketId: t.id, message: `Epic "${t.epic}" nicht gefunden — Ticket ohne Epic-Verknüpfung importiert` })
        }
      }
    }

    upsert(t.id, {
      projectId: ctx.projectId,
      title: t.title,
      description,
      status: mapStatus(t.status, t.id, warnings),
      category,
      assignedAgentLocalId: agent?.id,
      assignedAgentName: agent?.name,
      sortOrder: Date.parse(now) + index + 1,
      externalId: t.id,
      epicId,
      updatedAt: now,
    }, {
      title: t.title,
      description,
      category,
      assignedAgentLocalId: agent?.id,
      assignedAgentName: agent?.name,
      externalId: t.id,
      epicId,
    })
  }

  // depends_on erst nach Auflösung aller Tickets in Relationen übersetzen
  const dependencies: TicketDependencyPlan[] = []
  for (const t of data.tickets) {
    if (!t.depends_on || t.depends_on.length === 0) continue
    const ticketLocalId = localIdByExternal.get(t.id)
    if (!ticketLocalId) continue
    const resolved: string[] = []
    for (const dep of t.depends_on) {
      const depLocalId = localIdByExternal.get(dep)
      if (!depLocalId) {
        warnings.push({ ticketId: t.id, message: `Abhängigkeit "${dep}" nicht gefunden — wird übersprungen` })
        continue
      }
      if (depLocalId !== ticketLocalId) resolved.push(depLocalId)
    }
    dependencies.push({ ticketId: ticketLocalId, dependsOnIds: resolved })
  }

  return { inserts, updates, dependencies, warnings }
}

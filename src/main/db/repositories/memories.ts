import { getDb, nowIso } from '../connection'
import type { AgentMemory, MemorySource } from '@shared/types'

interface MemoryRow {
  id: number
  agent_id: string
  project_id: string | null
  key: string
  value: string
  importance: number
  source: MemorySource
  access_count: number
  last_accessed_at: string | null
  created_at: string
  updated_at: string
}

function toMemory(row: MemoryRow): AgentMemory {
  return {
    id: row.id,
    agentId: row.agent_id,
    projectId: row.project_id,
    key: row.key,
    value: row.value,
    importance: row.importance,
    source: row.source,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface MemoryFilter {
  agentId?: string
  /** `null` bedeutet ausdrücklich "nur globale Erinnerungen". */
  projectId?: string | null
}

function buildFilter(filter: MemoryFilter): { clause: string; values: unknown[] } {
  const conditions: string[] = []
  const values: unknown[] = []
  if (filter.agentId !== undefined) {
    conditions.push('agent_id = ?')
    values.push(filter.agentId)
  }
  if (filter.projectId !== undefined) {
    if (filter.projectId === null) {
      conditions.push('project_id IS NULL')
    } else {
      // Projektbezogene Abfragen sehen auch die globalen Erinnerungen des Agenten.
      conditions.push('(project_id = ? OR project_id IS NULL)')
      values.push(filter.projectId)
    }
  }
  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

export function listMemories(filter: MemoryFilter = {}): AgentMemory[] {
  const { clause, values } = buildFilter(filter)
  return getDb()
    .prepare<unknown[], MemoryRow>(
      `SELECT * FROM memories ${clause} ORDER BY importance DESC, updated_at DESC`,
    )
    .all(...values)
    .map(toMemory)
}

export function getMemory(id: number): AgentMemory | null {
  const row = getDb().prepare<[number], MemoryRow>('SELECT * FROM memories WHERE id = ?').get(id)
  return row ? toMemory(row) : null
}

export interface SaveMemoryInput {
  agentId: string
  projectId?: string | null
  key: string
  value: string
  importance?: number
  source?: MemorySource
}

/** Legt an oder überschreibt — Schlüssel sind pro Agent und Projekt eindeutig. */
export function saveMemory(input: SaveMemoryInput): AgentMemory {
  const now = nowIso()
  const db = getDb()
  db.prepare(
    `INSERT INTO memories (agent_id, project_id, key, value, importance, source,
                           access_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (agent_id, IFNULL(project_id, ''), key) DO UPDATE SET
       value = excluded.value,
       importance = excluded.importance,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  ).run(
    input.agentId,
    input.projectId ?? null,
    input.key,
    input.value,
    input.importance ?? 2,
    input.source ?? 'agent',
    now,
    now,
  )

  const row = db
    .prepare<[string, string | null, string], MemoryRow>(
      `SELECT * FROM memories
        WHERE agent_id = ? AND IFNULL(project_id, '') = IFNULL(?, '') AND key = ?`,
    )
    .get(input.agentId, input.projectId ?? null, input.key)
  return toMemory(row!)
}

export function deleteMemory(id: number): void {
  getDb().prepare('DELETE FROM memories WHERE id = ?').run(id)
}

export function clearMemories(filter: MemoryFilter = {}): number {
  const { clause, values } = buildFilter(filter)
  return getDb()
    .prepare(`DELETE FROM memories ${clause}`)
    .run(...values).changes
}

/** Zählt die Nutzung mit, damit selten gebrauchte Erinnerungen erkennbar bleiben. */
export function touchMemories(ids: number[]): void {
  if (ids.length === 0) return
  const db = getDb()
  const statement = db.prepare(
    'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
  )
  const now = nowIso()
  const run = db.transaction(() => {
    for (const id of ids) statement.run(now, id)
  })
  run()
}

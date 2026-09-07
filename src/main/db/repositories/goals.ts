import { getDb, nowIso } from '../connection'
import { buildUpdate, parseNullableJsonObject, parseStringArray, toJson } from '../utils'
import type { GoalStatus } from '@shared/constants'
import type { Goal, GoalLogEntry, GoalLogStatus, GoalMode, JsonObject } from '@shared/types'

interface GoalRow {
  id: number
  project_id: string
  title: string
  description: string | null
  mode: GoalMode
  status: GoalStatus
  phase: string | null
  spec_document_id: string | null
  selected_agent_ids: string
  checkpoint: string | null
  retry_count: number
  error_type: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

interface GoalLogRow {
  id: number
  goal_id: number
  phase: string | null
  agent_id: string | null
  ticket_id: string | null
  message: string
  status: GoalLogStatus
  created_at: string
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    mode: row.mode,
    status: row.status,
    phase: row.phase,
    specDocumentId: row.spec_document_id,
    selectedAgentIds: parseStringArray(row.selected_agent_ids),
    checkpoint: parseNullableJsonObject(row.checkpoint),
    retryCount: row.retry_count,
    errorType: row.error_type,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function toLogEntry(row: GoalLogRow): GoalLogEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    phase: row.phase,
    agentId: row.agent_id,
    ticketId: row.ticket_id,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }
}

export function listGoals(projectId: string): Goal[] {
  return getDb()
    .prepare<[string], GoalRow>('SELECT * FROM goals WHERE project_id = ? ORDER BY id DESC')
    .all(projectId)
    .map(toGoal)
}

export function getGoal(id: number): Goal | null {
  const row = getDb().prepare<[number], GoalRow>('SELECT * FROM goals WHERE id = ?').get(id)
  return row ? toGoal(row) : null
}

/** Vorhaben, die beim letzten Beenden noch liefen — beim Start wieder aufzunehmen. */
export function listActiveGoals(): Goal[] {
  return getDb()
    .prepare<[], GoalRow>(
      `SELECT * FROM goals
        WHERE status IN ('pending', 'planning', 'in_progress', 'reviewing')
        ORDER BY id`,
    )
    .all()
    .map(toGoal)
}

export interface CreateGoalInput {
  projectId: string
  title: string
  description?: string | null
  mode?: GoalMode
  status?: GoalStatus
  phase?: string | null
  specDocumentId?: string | null
  selectedAgentIds?: string[]
}

export function createGoal(input: CreateGoalInput): Goal {
  const now = nowIso()
  const result = getDb()
    .prepare(
      `INSERT INTO goals (project_id, title, description, mode, status, phase,
                          spec_document_id, selected_agent_ids, checkpoint, retry_count,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
    )
    .run(
      input.projectId,
      input.title,
      input.description ?? null,
      input.mode ?? 'ai',
      input.status ?? 'pending',
      input.phase ?? null,
      input.specDocumentId ?? null,
      toJson(input.selectedAgentIds ?? []),
      now,
      now,
    )
  return getGoal(Number(result.lastInsertRowid))!
}

export interface UpdateGoalInput {
  title?: string
  description?: string | null
  mode?: GoalMode
  status?: GoalStatus
  phase?: string | null
  specDocumentId?: string | null
  selectedAgentIds?: string[]
  checkpoint?: JsonObject | null
  retryCount?: number
  errorType?: string | null
  errorMessage?: string | null
  completedAt?: string | null
}

export function updateGoal(id: number, patch: UpdateGoalInput): Goal {
  const { clause, values } = buildUpdate({
    title: patch.title,
    description: patch.description,
    mode: patch.mode,
    status: patch.status,
    phase: patch.phase,
    spec_document_id: patch.specDocumentId,
    selected_agent_ids:
      patch.selectedAgentIds === undefined ? undefined : toJson(patch.selectedAgentIds),
    checkpoint:
      patch.checkpoint === undefined ? undefined : patch.checkpoint === null ? null : toJson(patch.checkpoint),
    retry_count: patch.retryCount,
    error_type: patch.errorType,
    error_message: patch.errorMessage,
    completed_at: patch.completedAt,
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE goals SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const goal = getGoal(id)
  if (!goal) throw new Error(`Vorhaben ${id} existiert nicht`)
  return goal
}

export function deleteGoal(id: number): void {
  getDb().prepare('DELETE FROM goals WHERE id = ?').run(id)
}

// --- Protokoll --------------------------------------------------------------

export interface AppendGoalLogInput {
  goalId: number
  message: string
  phase?: string | null
  agentId?: string | null
  ticketId?: string | null
  status?: GoalLogStatus
}

export function appendGoalLog(input: AppendGoalLogInput): GoalLogEntry {
  const result = getDb()
    .prepare(
      `INSERT INTO goal_log (goal_id, phase, agent_id, ticket_id, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.goalId,
      input.phase ?? null,
      input.agentId ?? null,
      input.ticketId ?? null,
      input.message,
      input.status ?? 'running',
      nowIso(),
    )
  const row = getDb()
    .prepare<[number], GoalLogRow>('SELECT * FROM goal_log WHERE id = ?')
    .get(Number(result.lastInsertRowid))
  return toLogEntry(row!)
}

export function updateGoalLogStatus(id: number, status: GoalLogStatus): void {
  getDb().prepare('UPDATE goal_log SET status = ? WHERE id = ?').run(status, id)
}

export function listGoalLog(goalId: number, limit = 500): GoalLogEntry[] {
  return getDb()
    .prepare<[number, number], GoalLogRow>(
      'SELECT * FROM goal_log WHERE goal_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(goalId, limit)
    .reverse()
    .map(toLogEntry)
}

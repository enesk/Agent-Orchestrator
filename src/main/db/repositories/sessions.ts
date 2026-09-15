import { getDb, nowIso } from '../connection'
import type { ClaudeSession } from '@shared/types'

interface SessionRow {
  scope_key: string
  session_id: string
  cwd: string | null
  turn_count: number
  created_at: string
  last_used_at: string
}

function toSession(row: SessionRow): ClaudeSession {
  return {
    scopeKey: row.scope_key,
    sessionId: row.session_id,
    cwd: row.cwd,
    turnCount: row.turn_count,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

/**
 * Scope-Schlüssel für eine wiederverwendbare CLI-Session. Alles, was den Systemprompt oder
 * das Arbeitsverzeichnis ändert, muss hier einfließen — sonst wird eine Session
 * fälschlich weiterverwendet.
 */
export function sessionScopeKey(parts: {
  projectId: string
  agentId: string
  goalId?: number | null
  ticketId?: string | null
}): string {
  return [
    parts.projectId,
    parts.agentId,
    parts.goalId != null ? `goal:${parts.goalId}` : '',
    parts.ticketId ? `ticket:${parts.ticketId}` : '',
  ]
    .filter(Boolean)
    .join('|')
}

export function getSession(scopeKey: string): ClaudeSession | null {
  const row = getDb()
    .prepare<[string], SessionRow>('SELECT * FROM claude_sessions WHERE scope_key = ?')
    .get(scopeKey)
  return row ? toSession(row) : null
}

export function saveSession(input: {
  scopeKey: string
  sessionId: string
  cwd?: string | null
}): ClaudeSession {
  const now = nowIso()
  getDb()
    .prepare(
      `INSERT INTO claude_sessions (scope_key, session_id, cwd, turn_count, created_at, last_used_at)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT (scope_key) DO UPDATE SET
         session_id = excluded.session_id,
         cwd = excluded.cwd,
         last_used_at = excluded.last_used_at`,
    )
    .run(input.scopeKey, input.sessionId, input.cwd ?? null, now, now)
  return getSession(input.scopeKey)!
}

export function recordTurn(scopeKey: string): ClaudeSession | null {
  getDb()
    .prepare(
      'UPDATE claude_sessions SET turn_count = turn_count + 1, last_used_at = ? WHERE scope_key = ?',
    )
    .run(nowIso(), scopeKey)
  return getSession(scopeKey)
}

export function deleteSession(scopeKey: string): void {
  getDb().prepare('DELETE FROM claude_sessions WHERE scope_key = ?').run(scopeKey)
}

/** Alle Sessions eines Projekts verwerfen, z.B. wenn sich der Projektpfad ändert. */
export function deleteSessionsForProject(projectId: string): void {
  getDb().prepare("DELETE FROM claude_sessions WHERE scope_key LIKE ?").run(`${projectId}|%`)
}

/** Alle Sessions eines Agenten über sämtliche Projekte, Vorhaben und Tickets hinweg. */
export function deleteSessionsForAgent(agentId: string): void {
  getDb()
    .prepare('DELETE FROM claude_sessions WHERE scope_key LIKE ? OR scope_key LIKE ?')
    .run(`%|${agentId}`, `%|${agentId}|%`)
}

export function clearSessions(): void {
  getDb().prepare('DELETE FROM claude_sessions').run()
}

export function listSessions(): ClaudeSession[] {
  return getDb()
    .prepare<[], SessionRow>('SELECT * FROM claude_sessions ORDER BY last_used_at DESC')
    .all()
    .map(toSession)
}

import { getDb, nowIso } from '../connection'
import { buildUpdate, fromBool, newId, toBool } from '../utils'
import {
  AGENT_COLORS,
  DEFAULT_AGENT_EFFORT,
  DEFAULT_AGENT_MODEL,
  type AgentEffort,
  type AgentRole,
} from '@shared/constants'
import type { Agent, ProjectAgent } from '@shared/types'

interface AgentRow {
  id: string
  name: string
  title: string | null
  mention_key: string
  role: AgentRole
  system_prompt: string
  model: string
  effort: AgentEffort
  color: string
  avatar: string | null
  created_at: string
  updated_at: string
}

interface ProjectAgentRow extends AgentRow {
  project_id: string
  sort_order: number
  stopped: number
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    mentionKey: row.mention_key,
    role: row.role,
    systemPrompt: row.system_prompt,
    model: row.model,
    effort: row.effort,
    color: row.color,
    avatar: row.avatar,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toProjectAgent(row: ProjectAgentRow): ProjectAgent {
  return {
    ...toAgent(row),
    projectId: row.project_id,
    sortOrder: row.sort_order,
    stopped: toBool(row.stopped),
  }
}

export interface CreateAgentInput {
  name: string
  title?: string | null
  mentionKey?: string
  role: AgentRole
  systemPrompt?: string
  model?: string
  effort?: AgentEffort
  color?: string
  avatar?: string | null
}

export interface UpdateAgentInput {
  name?: string
  title?: string | null
  mentionKey?: string
  role?: AgentRole
  systemPrompt?: string
  model?: string
  effort?: AgentEffort
  color?: string
  avatar?: string | null
}

const AGENT_COLUMNS = `a.id, a.name, a.title, a.mention_key, a.role, a.system_prompt,
  a.model, a.effort, a.color, a.avatar, a.created_at, a.updated_at`

export function listAgents(): Agent[] {
  return getDb()
    .prepare<[], AgentRow>('SELECT * FROM agents ORDER BY name COLLATE NOCASE')
    .all()
    .map(toAgent)
}

/** Alle Agenten ohne Projektbindung — für `agents.list` ohne `projectId`. */
export function listAgentsAsProjectAgents(): ProjectAgent[] {
  return listAgents().map((agent) => ({
    ...agent,
    projectId: null,
    sortOrder: 0,
    stopped: false,
  }))
}

export function getAgent(id: string): Agent | null {
  const row = getDb().prepare<[string], AgentRow>('SELECT * FROM agents WHERE id = ?').get(id)
  return row ? toAgent(row) : null
}

export function getAgentByMentionKey(mentionKey: string): Agent | null {
  const row = getDb()
    .prepare<[string], AgentRow>('SELECT * FROM agents WHERE mention_key = ?')
    .get(mentionKey)
  return row ? toAgent(row) : null
}

export function listAgentsByRole(role: AgentRole, projectId?: string): Agent[] {
  if (projectId) {
    return listProjectAgents(projectId).filter((agent) => agent.role === role)
  }
  return listAgents().filter((agent) => agent.role === role)
}

/** Erzeugt aus einem Namen ein freies Erwähnungskürzel wie `@lena` oder `@lena2`. */
export function deriveMentionKey(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || 'agent'
  let candidate = `@${base}`
  let counter = 2
  while (getAgentByMentionKey(candidate)) {
    candidate = `@${base}${counter}`
    counter += 1
  }
  return candidate
}

export function createAgent(input: CreateAgentInput): Agent {
  const id = newId()
  const now = nowIso()
  const color = input.color ?? AGENT_COLORS[countAgents() % AGENT_COLORS.length]
  getDb()
    .prepare(
      `INSERT INTO agents (id, name, title, mention_key, role, system_prompt, model, effort,
                           color, avatar, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.title ?? null,
      input.mentionKey ?? deriveMentionKey(input.name),
      input.role,
      input.systemPrompt ?? '',
      input.model ?? DEFAULT_AGENT_MODEL,
      input.effort ?? DEFAULT_AGENT_EFFORT,
      color,
      input.avatar ?? null,
      now,
      now,
    )
  return getAgent(id)!
}

export function updateAgent(id: string, patch: UpdateAgentInput): Agent {
  const { clause, values } = buildUpdate({
    name: patch.name,
    title: patch.title,
    mention_key: patch.mentionKey,
    role: patch.role,
    system_prompt: patch.systemPrompt,
    model: patch.model,
    effort: patch.effort,
    color: patch.color,
    avatar: patch.avatar,
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE agents SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const agent = getAgent(id)
  if (!agent) throw new Error(`Agent ${id} existiert nicht`)
  return agent
}

export function deleteAgent(id: string): void {
  getDb().prepare('DELETE FROM agents WHERE id = ?').run(id)
}

export function countAgents(): number {
  const row = getDb()
    .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM agents')
    .get()
  return row?.count ?? 0
}

// --- Projektzuordnung -------------------------------------------------------

export function listProjectAgents(projectId: string): ProjectAgent[] {
  return getDb()
    .prepare<[string], ProjectAgentRow>(
      `SELECT ${AGENT_COLUMNS}, pa.project_id, pa.sort_order, pa.stopped
         FROM project_agents pa
         JOIN agents a ON a.id = pa.agent_id
        WHERE pa.project_id = ?
        ORDER BY pa.sort_order, a.name COLLATE NOCASE`,
    )
    .all(projectId)
    .map(toProjectAgent)
}

export function getProjectAgent(projectId: string, agentId: string): ProjectAgent | null {
  const row = getDb()
    .prepare<[string, string], ProjectAgentRow>(
      `SELECT ${AGENT_COLUMNS}, pa.project_id, pa.sort_order, pa.stopped
         FROM project_agents pa
         JOIN agents a ON a.id = pa.agent_id
        WHERE pa.project_id = ? AND pa.agent_id = ?`,
    )
    .get(projectId, agentId)
  return row ? toProjectAgent(row) : null
}

export function addAgentToProject(
  projectId: string,
  agentId: string,
  sortOrder?: number,
): ProjectAgent {
  const order = sortOrder ?? nextSortOrder(projectId)
  getDb()
    .prepare(
      `INSERT INTO project_agents (project_id, agent_id, sort_order, stopped)
       VALUES (?, ?, ?, 0)
       ON CONFLICT (project_id, agent_id) DO UPDATE SET sort_order = excluded.sort_order`,
    )
    .run(projectId, agentId, order)
  const projectAgent = getProjectAgent(projectId, agentId)
  if (!projectAgent) throw new Error(`Agent ${agentId} konnte dem Projekt nicht zugeordnet werden`)
  return projectAgent
}

export function removeAgentFromProject(projectId: string, agentId: string): void {
  getDb()
    .prepare('DELETE FROM project_agents WHERE project_id = ? AND agent_id = ?')
    .run(projectId, agentId)
}

export function setAgentStopped(
  projectId: string,
  agentId: string,
  stopped: boolean,
): ProjectAgent {
  getDb()
    .prepare('UPDATE project_agents SET stopped = ? WHERE project_id = ? AND agent_id = ?')
    .run(fromBool(stopped), projectId, agentId)
  const projectAgent = getProjectAgent(projectId, agentId)
  if (!projectAgent) throw new Error(`Agent ${agentId} ist dem Projekt nicht zugeordnet`)
  return projectAgent
}

export function setAgentSortOrder(projectId: string, agentId: string, sortOrder: number): void {
  getDb()
    .prepare('UPDATE project_agents SET sort_order = ? WHERE project_id = ? AND agent_id = ?')
    .run(sortOrder, projectId, agentId)
}

function nextSortOrder(projectId: string): number {
  const row = getDb()
    .prepare<[string], { next: number | null }>(
      'SELECT MAX(sort_order) + 1 AS next FROM project_agents WHERE project_id = ?',
    )
    .get(projectId)
  return row?.next ?? 0
}

export { toAgent }

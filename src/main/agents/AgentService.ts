import {
  addAgentToProject,
  createAgent,
  deleteAgent,
  getAgent,
  getAgentByMentionKey,
  getProjectAgent,
  listAgentsAsProjectAgents,
  listProjectAgents,
  removeAgentFromProject,
  setAgentStopped,
  updateAgent,
  type CreateAgentInput,
  type UpdateAgentInput,
} from '../db/repositories/agents'
import { deleteSessionsForAgent } from '../db/repositories/sessions'
import { prepareSkillDirectory } from '../claude/SkillDirectory'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import { cancelAgentRuns } from './runControl'
import {
  generateAgentPrompt,
  type PromptGenerationRequest,
  type PromptGenerationResult,
} from './promptGeneration'
import type { AgentRole } from '@shared/constants'
import type { Agent, ProjectAgent } from '@shared/types'

const log = scopedLogger('agents')

export function list(projectId?: string | null): ProjectAgent[] {
  return projectId ? listProjectAgents(projectId) : listAgentsAsProjectAgents()
}

export function get(id: string): Agent | null {
  return getAgent(id)
}

export function create(input: CreateAgentInput): Agent {
  const agent = createAgent({
    ...input,
    mentionKey: normalizeMentionKey(input.mentionKey ?? input.name),
  })
  emitEvent('agent.changed', { agentId: agent.id, projectId: null, action: 'created' })
  log.info('Agent angelegt', { id: agent.id, name: agent.name, role: agent.role })
  return agent
}

export function update(id: string, patch: UpdateAgentInput): Agent {
  const mentionKey =
    patch.mentionKey === undefined ? undefined : normalizeMentionKey(patch.mentionKey, id)
  const skillsBefore = patch.skillIds ? getAgent(id)?.skillIds : undefined
  const agent = updateAgent(id, { ...patch, mentionKey })
  if (skillsBefore && !sameIds(skillsBefore, agent.skillIds)) {
    // Ein fortgesetztes Transkript enthält bereits geladene Skill-Inhalte; ohne Kaltstart
    // wirkte ein entfernter Skill weiter.
    deleteSessionsForAgent(id)
  }
  emitEvent('agent.changed', { agentId: agent.id, projectId: null, action: 'updated' })
  return agent
}

export function remove(id: string): void {
  deleteAgent(id)
  // Ohne Skills räumt der Aufruf den Plugin-Ordner des Agenten weg.
  prepareSkillDirectory(id, [])
  emitEvent('agent.changed', { agentId: id, projectId: null, action: 'removed' })
  log.info('Agent gelöscht', { id })
}

export function addToProject(
  projectId: string,
  agentId: string,
  sortOrder?: number,
): ProjectAgent {
  const projectAgent = addAgentToProject(projectId, agentId, sortOrder)
  emitEvent('agent.changed', { agentId, projectId, action: 'created' })
  return projectAgent
}

export function removeFromProject(projectId: string, agentId: string): void {
  removeAgentFromProject(projectId, agentId)
  cancelAgentRuns(projectId, agentId)
  emitEvent('agent.changed', { agentId, projectId, action: 'removed' })
}

/**
 * Der Stopp-Schalter ist dauerhaft: er überlebt den Neustart und hält den Agenten aus
 * jedem weiteren Lauf heraus, bis er wieder freigegeben wird.
 */
export function setStopped(projectId: string, agentId: string, stopped: boolean): ProjectAgent {
  const projectAgent = setAgentStopped(projectId, agentId, stopped)
  if (stopped) cancelAgentRuns(projectId, agentId)
  emitEvent('agent.changed', { agentId, projectId, action: 'updated' })
  log.info(stopped ? 'Agent gestoppt' : 'Agent freigegeben', { projectId, agentId })
  return projectAgent
}

/**
 * Der Agent, der diese Rolle im Projekt ausfüllt — oder `null`. Legt bewusst nichts an;
 * Standard-Agenten entstehen an anderer Stelle.
 */
export function ensureRole(projectId: string, role: AgentRole): ProjectAgent | null {
  const candidates = listProjectAgents(projectId).filter((agent) => agent.role === role)
  return candidates.find((agent) => !agent.stopped) ?? candidates[0] ?? null
}

export function isStopped(projectId: string, agentId: string): boolean {
  return getProjectAgent(projectId, agentId)?.stopped ?? false
}

export function generatePrompt(
  request: PromptGenerationRequest,
): Promise<PromptGenerationResult> {
  return generateAgentPrompt(request)
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/**
 * Erwähnungskürzel sind klein, beginnen mit `@`, enthalten keine Leerzeichen und sind
 * global eindeutig — bei Kollision wird ein Zähler angehängt.
 */
export function normalizeMentionKey(raw: string, excludeAgentId?: string): string {
  const base =
    raw
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || 'agent'

  let candidate = `@${base}`
  let counter = 2
  while (isTaken(candidate, excludeAgentId)) {
    candidate = `@${base}${counter}`
    counter += 1
  }
  return candidate
}

function isTaken(mentionKey: string, excludeAgentId?: string): boolean {
  const owner = getAgentByMentionKey(mentionKey)
  return owner !== null && owner.id !== excludeAgentId
}

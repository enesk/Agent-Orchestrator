import type { Agent, ProjectAgent } from '@shared/types'
import { listAgents } from '../db/repositories/agents'
import { getMessage, listThread } from '../db/repositories/messages'

/**
 * Der Agent, an den eine Thread-Antwort ohne Erwähnung geht. Ein Agent, der inzwischen aus dem
 * Projekt entfernt wurde, wird trotzdem gemeldet — sonst sähe der Nutzer nur „niemand erwähnt"
 * und wüsste nicht, warum sein Gegenüber schweigt.
 */
export type ThreadTarget =
  | { kind: 'inProject'; agent: ProjectAgent }
  | { kind: 'outsideProject'; agent: Agent }

/**
 * Im Thread ist ohne Erwähnung klar, wer gemeint ist: der Agent, dessen Antwort den Thread
 * eröffnet hat. Hat der Nutzer den Thread selbst eröffnet, wäre das er selbst — dann zählt der
 * Agent, der zuletzt in diesem Thread geschrieben hat.
 */
export function resolveThreadTarget(
  rootId: string,
  projectAgents: readonly ProjectAgent[],
): ThreadTarget | null {
  const root = getMessage(rootId)
  if (!root) return null

  if (root.role === 'agent') return toTarget(root.agentId, projectAgents)
  if (root.role !== 'user') return null

  const thread = listThread(rootId)
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const message = thread[index]!
    if (message.role !== 'agent') continue
    const target = toTarget(message.agentId, projectAgents)
    if (target) return target
  }
  return null
}

function toTarget(
  agentId: string | null,
  projectAgents: readonly ProjectAgent[],
): ThreadTarget | null {
  if (!agentId) return null

  const inProject = projectAgents.find((agent) => agent.id === agentId)
  if (inProject) return { kind: 'inProject', agent: inProject }

  const global = listAgents().find((agent) => agent.id === agentId)
  return global ? { kind: 'outsideProject', agent: global } : null
}

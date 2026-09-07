import { listProjectAgents } from '../../db/repositories/agents'
import type { RunContext } from '../RunContextRegistry'

export interface ToolContext {
  context: RunContext
  /** Wird für `goal_report` gebraucht, um die Meldung am richtigen Kontext abzulegen. */
  token: string
}

export interface AssigneeResolution {
  agentId: string | null
  error: string | null
}

/**
 * Nimmt `@kuerzel`, das Kürzel ohne `@` oder den Klarnamen — aber nur von Agenten, die dem
 * Projekt zugeordnet sind. Ein leerer Wert hebt die Zuweisung auf.
 */
export function resolveAssignee(projectId: string, raw: string | undefined): AssigneeResolution {
  if (raw === undefined) return { agentId: null, error: null }

  const needle = raw.trim().toLowerCase()
  if (!needle) return { agentId: null, error: null }

  const agents = listProjectAgents(projectId)
  const match = agents.find(
    (agent) =>
      agent.mentionKey.toLowerCase() === needle ||
      agent.mentionKey.replace(/^@/, '').toLowerCase() === needle ||
      agent.name.toLowerCase() === needle,
  )
  if (match) return { agentId: match.id, error: null }

  const known = agents.map((agent) => agent.mentionKey).join(', ') || '—'
  return {
    agentId: null,
    error: `Es gibt in diesem Projekt keinen Agenten „${raw}". Verfügbar: ${known}`,
  }
}

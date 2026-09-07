import type { ProjectAgent } from '@shared/types'

/**
 * Erwähnungen werden ausschließlich über die Mention-Keys der Projekt-Agenten aufgelöst —
 * kein Erraten über Namen, keine Textmuster. Längere Kürzel zuerst, damit `@lena2` nicht
 * als `@lena` gelesen wird.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pattern(agents: readonly ProjectAgent[]): RegExp | null {
  const keys = agents
    .map((agent) => agent.mentionKey)
    .filter((key) => key.length > 1)
    .sort((a, b) => b.length - a.length)
  if (keys.length === 0) return null
  return new RegExp(`(${keys.map(escapeRegExp).join('|')})`, 'gi')
}

/** Die im Text erwähnten Agenten, in Reihenfolge des Auftretens und ohne Dubletten. */
export function mentionedAgents(
  agents: readonly ProjectAgent[],
  text: string,
): ProjectAgent[] {
  const regex = pattern(agents)
  if (!regex) return []

  const byKey = new Map(agents.map((agent) => [agent.mentionKey.toLowerCase(), agent]))
  const found: ProjectAgent[] = []
  for (const match of text.matchAll(regex)) {
    const agent = byKey.get(match[0].toLowerCase())
    if (agent && !found.includes(agent)) found.push(agent)
  }
  return found
}

/**
 * Auflösung für eine gesendete Nachricht: was im Text steht, plus die IDs, die die Oberfläche
 * mitschickt. Unbekannte IDs fallen weg — der Renderer darf nichts erzwingen, was nicht zum
 * Projekt gehört.
 */
export function resolveMentions(
  agents: readonly ProjectAgent[],
  text: string,
  explicitIds?: readonly string[],
): ProjectAgent[] {
  const resolved = mentionedAgents(agents, text)
  for (const id of explicitIds ?? []) {
    const agent = agents.find((candidate) => candidate.id === id)
    if (agent && !resolved.includes(agent)) resolved.push(agent)
  }
  return resolved
}

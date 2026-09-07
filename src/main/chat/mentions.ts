import type { Agent, ProjectAgent } from '@shared/types'

/**
 * Erwähnungen werden ausschließlich über die Mention-Keys der Projekt-Agenten aufgelöst —
 * kein Erraten über Namen, keine Textmuster. Längere Kürzel zuerst, damit `@lena2` nicht
 * als `@lena` gelesen wird.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Alles, was zum Erkennen einer Erwähnung reicht — Projekt-Agenten wie globale Agenten. */
type Mentionable = Pick<Agent, 'id' | 'name' | 'mentionKey'>

function pattern(agents: readonly Mentionable[]): RegExp | null {
  const keys = agents
    .map((agent) => agent.mentionKey)
    .filter((key) => key.length > 1)
    .sort((a, b) => b.length - a.length)
  if (keys.length === 0) return null
  return new RegExp(`(${keys.map(escapeRegExp).join('|')})`, 'gi')
}

/** Die im Text erwähnten Agenten, in Reihenfolge des Auftretens und ohne Dubletten. */
export function mentionedAgents<T extends Mentionable>(
  agents: readonly T[],
  text: string,
): T[] {
  const regex = pattern(agents)
  if (!regex) return []

  const byKey = new Map(agents.map((agent) => [agent.mentionKey.toLowerCase(), agent]))
  const found: T[] = []
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

/**
 * Agenten, die es zwar gibt, die aber nicht zum Projekt gehören. Genau das ist der Fall, in dem
 * eine Erwähnung wie richtig aussieht und trotzdem niemanden startet — der Nutzer muss es
 * erfahren, statt vor einer stummen Nachricht zu sitzen.
 */
export function mentionedOutsideProject(
  projectAgents: readonly ProjectAgent[],
  allAgents: readonly Agent[],
  text: string,
): Agent[] {
  const inProject = new Set(projectAgents.map((agent) => agent.id))
  return mentionedAgents(allAgents, text).filter((agent) => !inProject.has(agent.id))
}

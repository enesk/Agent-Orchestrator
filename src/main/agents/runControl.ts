/**
 * Schmale Schnittstelle zwischen "Agent gestoppt" und "laufenden Run abbrechen". Der
 * ClaudeRunner entsteht in einem anderen Ticket; er meldet sich hier an, statt dass der
 * AgentService ihn importiert. Ohne angemeldeten Abbrecher wird das Stoppen nur persistiert.
 */
export type AgentRunCanceller = (projectId: string, agentId: string) => void

const cancellers = new Set<AgentRunCanceller>()

/** Meldet einen Abbrecher an und liefert die Abmeldung zurück. */
export function registerAgentRunCanceller(canceller: AgentRunCanceller): () => void {
  cancellers.add(canceller)
  return () => {
    cancellers.delete(canceller)
  }
}

/** Bricht alle laufenden Runs dieses Agenten im Projekt ab. */
export function cancelAgentRuns(projectId: string, agentId: string): void {
  for (const canceller of cancellers) canceller(projectId, agentId)
}

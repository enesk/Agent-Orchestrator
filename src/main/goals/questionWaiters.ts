/**
 * Welche Tickets gerade auf die Antwort zu einer Rückfrage warten — und damit, welche
 * Rückfragen die laufende Arbeitsphase selbst wieder aufnimmt.
 *
 * Bewusst ein eigenes Modul ohne Importe: `QuestionService` muss beim Beantworten wissen, ob
 * sich schon jemand um die Fortsetzung kümmert, und darf dafür nicht in die Goal-Engine
 * greifen (und sie nicht in den Dienst). Reiner Laufzeitzustand — nach einem Neustart ist die
 * Karte leer, und die Arbeitsphase füllt sie beim Aufsetzen aus der Datenbank neu.
 */

const waiting = new Map<string, number>()

export function markWaiting(ticketId: string, goalId: number): void {
  waiting.set(ticketId, goalId)
}

export function clearWaiting(ticketId: string): void {
  waiting.delete(ticketId)
}

/** `true`, wenn eine laufende Arbeitsphase dieses Ticket wieder aufnimmt. */
export function isWaitingForQuestion(ticketId: string | null): boolean {
  return ticketId !== null && waiting.has(ticketId)
}

/** Beim Ende einer Phase aufrufen — sonst gilt ein Ticket für immer als betreut. */
export function clearWaitingForGoal(goalId: number): void {
  for (const [ticketId, id] of [...waiting.entries()]) {
    if (id === goalId) waiting.delete(ticketId)
  }
}

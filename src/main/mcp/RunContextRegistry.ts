import { randomBytes } from 'node:crypto'

/**
 * Wer gerade fragt. Die Werkzeuge bekommen diese Angaben nicht als Parameter, sondern
 * ausschließlich aus dem Token der Anfrage — ein Agent kann also nicht in ein fremdes
 * Projekt schreiben, indem er eine andere ID behauptet.
 */
export interface RunContext {
  projectId: string
  agentId: string
  goalId?: number | null
  ticketId?: string | null
}

export type GoalReportKind = 'complete' | 'retry' | 'blocked_by'

/** Rückmeldung eines Laufs an die Goal-Engine, abgelegt am Kontext statt im Antworttext. */
export interface GoalReport {
  kind: GoalReportKind
  summary: string | null
  blockingTicketNumber: number | null
  reportedAt: string
}

interface Entry {
  context: RunContext
  report: GoalReport | null
  /** IDs der Rückfragen, die dieser Lauf über `ask_user` gestellt hat (A3). */
  questionIds: string[]
}

const entries = new Map<string, Entry>()

/** 256 Bit aus dem CSPRNG — raten ist damit keine Angriffsfläche. */
function newToken(): string {
  return randomBytes(32).toString('hex')
}

export function register(context: RunContext): string {
  const token = newToken()
  entries.set(token, { context, report: null, questionIds: [] })
  return token
}

export function resolve(token: string | null | undefined): RunContext | null {
  if (!token) return null
  return entries.get(token)?.context ?? null
}

export function setReport(token: string, report: GoalReport): boolean {
  const entry = entries.get(token)
  if (!entry) return false
  entry.report = report
  return true
}

/** Holt die Rückmeldung ab und löscht sie — jede Meldung wird genau einmal verarbeitet. */
export function takeReport(token: string): GoalReport | null {
  const entry = entries.get(token)
  if (!entry) return null
  const report = entry.report
  entry.report = null
  return report
}

/**
 * Vermerkt eine gestellte Rückfrage am Lauf. Wie bei `setReport` liegt die Angabe am Kontext
 * und nicht im Antworttext: der Aufrufer muss erkennen können, dass dieser Lauf nicht fertig
 * ist, sondern wartet — und zwar ohne den Text zu lesen.
 */
export function addQuestion(token: string, questionId: string): boolean {
  const entry = entries.get(token)
  if (!entry) return false
  entry.questionIds.push(questionId)
  return true
}

/** Holt die gestellten Fragen ab und leert die Liste. Muss vor `release` passieren. */
export function takeQuestions(token: string): string[] {
  const entry = entries.get(token)
  if (!entry) return []
  const ids = entry.questionIds
  entry.questionIds = []
  return ids
}

/** Nach dem Lauf aufrufen. Das Token ist danach wertlos. */
export function release(token: string): void {
  entries.delete(token)
}

export function releaseAll(): void {
  entries.clear()
}

export function activeTokenCount(): number {
  return entries.size
}

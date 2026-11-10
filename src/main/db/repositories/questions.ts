import { getDb, nowIso } from '../connection'
import { newId, parseStringArray, toJson } from '../utils'
import type { AgentQuestion, QuestionStatus } from '@shared/types'

/**
 * Rückfragen der Agenten. Row → Domänentyp wird hier gemappt, nicht im Service: die
 * `options`-Spalte ist JSON, und `goal_id` ist in SQLite eine Zahl oder `NULL`.
 */

/**
 * Die Ticketnummer wird mitgelesen statt nachgeschlagen: die Oberfläche zeigt „#12", und ein
 * zweiter Zugriff je Frage wäre dafür Verschwendung.
 */
const SELECT = `SELECT q.*, t.number AS ticket_number
                FROM questions q LEFT JOIN tickets t ON t.id = q.ticket_id`

interface QuestionRow {
  id: string
  project_id: string
  agent_id: string
  goal_id: number | null
  ticket_id: string | null
  question: string
  context: string | null
  options: string
  status: string
  answer: string | null
  asked_at: string
  answered_at: string | null
  expires_at: string
  ticket_number: number | null
}

const STATUSES: readonly QuestionStatus[] = ['open', 'answered', 'discarded', 'expired']

function toStatus(raw: string): QuestionStatus {
  return (STATUSES as readonly string[]).includes(raw) ? (raw as QuestionStatus) : 'open'
}

function toQuestion(row: QuestionRow): AgentQuestion {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    question: row.question,
    context: row.context,
    options: parseStringArray(row.options),
    status: toStatus(row.status),
    answer: row.answer,
    askedAt: row.asked_at,
    answeredAt: row.answered_at,
    expiresAt: row.expires_at,
  }
}

export interface CreateQuestionInput {
  projectId: string
  agentId: string
  goalId?: number | null
  ticketId?: string | null
  question: string
  context?: string | null
  options?: readonly string[]
  /** Zeitpunkt, ab dem die Frage als unbeantwortet geschlossen wird. */
  expiresAt: string
}

export function createQuestion(input: CreateQuestionInput): AgentQuestion {
  const id = newId()
  const askedAt = nowIso()

  getDb()
    .prepare(
      `INSERT INTO questions
         (id, project_id, agent_id, goal_id, ticket_id, question, context, options,
          status, answer, asked_at, answered_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, NULL, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.agentId,
      input.goalId ?? null,
      input.ticketId ?? null,
      input.question,
      input.context ?? null,
      toJson([...(input.options ?? [])]),
      askedAt,
      input.expiresAt,
    )

  return getQuestion(id)!
}

export function getQuestion(id: string): AgentQuestion | null {
  const row = getDb()
    .prepare<[string], QuestionRow>(`${SELECT} WHERE q.id = ?`)
    .get(id)
  return row ? toQuestion(row) : null
}

export interface ListQuestionsOptions {
  projectId?: string | null
  /** `null` oder weggelassen heißt: alle Zustände. */
  status?: QuestionStatus | null
  limit?: number
}

export function listQuestions(options: ListQuestionsOptions = {}): AgentQuestion[] {
  const where: string[] = []
  const values: unknown[] = []

  if (options.projectId) {
    where.push('q.project_id = ?')
    values.push(options.projectId)
  }
  if (options.status) {
    where.push('q.status = ?')
    values.push(options.status)
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = options.limit ? ' LIMIT ?' : ''
  if (options.limit) values.push(options.limit)

  return getDb()
    .prepare<unknown[], QuestionRow>(`${SELECT} ${clause} ORDER BY q.asked_at DESC${limit}`)
    .all(...values)
    .map(toQuestion)
}

export function countOpenQuestions(projectId?: string | null): number {
  const db = getDb()
  if (projectId) {
    return (
      db
        .prepare<[string], { count: number }>(
          "SELECT COUNT(*) AS count FROM questions WHERE status = 'open' AND project_id = ?",
        )
        .get(projectId)?.count ?? 0
    )
  }
  return (
    db
      .prepare<[], { count: number }>(
        "SELECT COUNT(*) AS count FROM questions WHERE status = 'open'",
      )
      .get()?.count ?? 0
  )
}

/** Die offenen Fragen zu einem Ticket — die Arbeitsphase fragt das in jedem Durchlauf. */
export function listOpenQuestionsForTicket(ticketId: string): AgentQuestion[] {
  return getDb()
    .prepare<[string], QuestionRow>(
      `${SELECT} WHERE q.ticket_id = ? AND q.status = 'open' ORDER BY q.asked_at`,
    )
    .all(ticketId)
    .map(toQuestion)
}

/**
 * Fragen zu einem Ticket, die beantwortet wurden und noch nicht an den nächsten Lauf
 * übergeben worden sind. „Übergeben" ist kein Zustand in der Tabelle: die Arbeitsphase holt
 * sie genau einmal, wenn sie das Ticket wieder aufnimmt.
 */
export function listAnsweredQuestionsForTicket(ticketId: string): AgentQuestion[] {
  return getDb()
    .prepare<[string], QuestionRow>(
      `${SELECT} WHERE q.ticket_id = ? AND q.status = 'answered' ORDER BY q.asked_at`,
    )
    .all(ticketId)
    .map(toQuestion)
}

/**
 * Setzt den Zustand einer **offenen** Frage. Die Bedingung auf `status = 'open'` ist die
 * Absicherung gegen ein zweites Beantworten: zwei Klicks hintereinander dürfen den Lauf
 * nicht zweimal starten. `null` heißt, die Frage war schon geschlossen.
 */
export function closeQuestion(
  id: string,
  status: Exclude<QuestionStatus, 'open'>,
  answer: string | null,
): AgentQuestion | null {
  const changes = getDb()
    .prepare(
      `UPDATE questions SET status = ?, answer = ?, answered_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .run(status, answer, nowIso(), id).changes

  return changes === 0 ? null : getQuestion(id)
}

/**
 * Alle offenen Fragen, deren Frist abgelaufen ist. Der Zeitpunkt kommt von außen, damit der
 * Verfall prüfbar ist, ohne sieben Tage zu warten.
 */
export function listOverdueQuestions(now: string): AgentQuestion[] {
  return getDb()
    .prepare<[string], QuestionRow>(
      `${SELECT} WHERE q.status = 'open' AND q.expires_at <= ? ORDER BY q.asked_at`,
    )
    .all(now)
    .map(toQuestion)
}

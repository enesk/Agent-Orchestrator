import { QUESTION_MAX_OPTIONS } from '@shared/ipc-contract'
import type { AgentQuestion } from '@shared/types'
import { notifyQuestion } from '../app/notifications'
import { mainT } from '../app/settings'
import { getAgent } from '../db/repositories/agents'
import { getProject } from '../db/repositories/projects'
import { getTicket } from '../db/repositories/tickets'
import {
  closeQuestion,
  countOpenQuestions,
  createQuestion,
  getQuestion,
  listOverdueQuestions,
  listQuestions,
  type ListQuestionsOptions,
} from '../db/repositories/questions'
import { isWaitingForQuestion } from '../goals/questionWaiters'
import { emitEvent } from '../ipc/events'
import { describeError, scopedLogger } from '../Logger'

const log = scopedLogger('questions')

/** Sieben Tage. Danach gilt die Frage als unbeantwortet geschlossen. */
export const QUESTION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** So oft wird nach abgelaufenen Fristen gesehen. Eine Stunde genügt bei sieben Tagen Frist. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/** So lang darf eine Frage sein. Was länger ist, gehört in `context`. */
const QUESTION_LIMIT = 2_000
const CONTEXT_LIMIT = 4_000
const OPTION_LIMIT = 200
const ANSWER_LIMIT = 4_000

// ---------------------------------------------------------------------------
// Fortsetzung — von außen eingehängt
// ---------------------------------------------------------------------------

/**
 * Wie ein wartender Lauf weitergeht. Der Dienst kennt den Weg nicht selbst: ein Chatlauf wird
 * über `ChatService` fortgesetzt, ein Ticket eines Vorhabens von der laufenden Arbeitsphase.
 * Eingehängt wird in `questions/wiring.ts` — sonst zöge dieser Dienst den halben Main-Prozess
 * hinter sich her und es gäbe einen Importkreis.
 */
export type QuestionResumer = (question: AgentQuestion) => void | Promise<void>

let resumeChatRun: QuestionResumer | null = null

export function registerChatResumer(resumer: QuestionResumer | null): void {
  resumeChatRun = resumer
}

// ---------------------------------------------------------------------------
// Fragen stellen
// ---------------------------------------------------------------------------

export interface AskInput {
  projectId: string
  agentId: string
  goalId?: number | null
  ticketId?: string | null
  question: string
  context?: string | null
  options?: readonly string[]
}

function clamp(text: string, limit: number): string {
  const trimmed = text.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit).trimEnd()}…` : trimmed
}

/**
 * Legt die Frage ab und meldet sie. Der Lauf, aus dem sie kommt, endet danach von selbst —
 * hier wird nichts blockiert und nichts abgewartet.
 */
export function ask(input: AskInput): AgentQuestion {
  const question = createQuestion({
    projectId: input.projectId,
    agentId: input.agentId,
    goalId: input.goalId ?? null,
    ticketId: input.ticketId ?? null,
    question: clamp(input.question, QUESTION_LIMIT),
    context: input.context?.trim() ? clamp(input.context, CONTEXT_LIMIT) : null,
    options: (input.options ?? [])
      .map((option) => clamp(option, OPTION_LIMIT))
      .filter((option) => option.length > 0)
      .slice(0, QUESTION_MAX_OPTIONS),
    expiresAt: new Date(Date.now() + QUESTION_TTL_MS).toISOString(),
  })

  log.info('Rückfrage gestellt', {
    id: question.id,
    projectId: question.projectId,
    agentId: question.agentId,
    goalId: question.goalId,
    ticketId: question.ticketId,
  })

  announce(question)
  publish(question, 'created')
  return question
}

/**
 * Die Systembenachrichtigung. Anders als beim fertigen Agentenlauf auch dann, wenn das
 * Fenster vorne ist: eine Frage, die keiner sieht, ist genau der Fall, den A3 abstellt —
 * und der Nutzer kann in einem anderen Bereich der App stehen.
 */
function announce(question: AgentQuestion): void {
  try {
    const agent = getAgent(question.agentId)
    const ticket = question.ticketId === null ? null : getTicket(question.ticketId)
    notifyQuestion({
      agentName: agent?.name ?? mainT()('common.unknown'),
      question: question.question,
      ticketNumber: ticket?.number ?? null,
    })
  } catch (error) {
    // Eine misslungene Meldung darf die Frage nicht verhindern — sie steht schon in der
    // Datenbank und ist in der Oberfläche sichtbar.
    log.warn('Rückfrage konnte nicht gemeldet werden', describeError(error))
  }
}

function publish(question: AgentQuestion, action: 'created' | 'updated' | 'removed'): void {
  emitEvent('question.changed', {
    questionId: question.id,
    projectId: question.projectId,
    question,
    action,
    openCount: countOpenQuestions(),
  })
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export function list(options: ListQuestionsOptions = {}): AgentQuestion[] {
  return listQuestions(options)
}

export function openCount(projectId?: string | null): number {
  return countOpenQuestions(projectId)
}

export function get(id: string): AgentQuestion | null {
  return getQuestion(id)
}

// ---------------------------------------------------------------------------
// Antworten, verwerfen, verfallen
// ---------------------------------------------------------------------------

/**
 * Beantwortet die Frage und nimmt den Lauf wieder auf. Zwei Klicks hintereinander starten
 * nichts zweimal: `closeQuestion` greift nur auf einer offenen Frage.
 */
export function answer(id: string, text: string): AgentQuestion {
  const trimmed = text.trim()
  if (!trimmed) throw new Error(mainT()('main.error.questionAnswerEmpty'))

  const closed = closeQuestion(id, 'answered', clamp(trimmed, ANSWER_LIMIT))
  if (!closed) {
    const existing = getQuestion(id)
    throw new Error(
      mainT()(existing ? 'main.error.questionClosed' : 'main.error.questionGone'),
    )
  }

  publish(closed, 'updated')
  resume(closed)
  return closed
}

/** Verwerfen: geschlossen, aber kein Lauf wird fortgesetzt. */
export function discard(id: string): AgentQuestion {
  const closed = closeQuestion(id, 'discarded', null)
  if (!closed) {
    const existing = getQuestion(id)
    throw new Error(
      mainT()(existing ? 'main.error.questionClosed' : 'main.error.questionGone'),
    )
  }
  log.info('Rückfrage verworfen', { id })
  publish(closed, 'updated')
  return closed
}

/**
 * Wer den wartenden Lauf fortsetzt. Ein Ticket, das eine laufende Arbeitsphase betreut, nimmt
 * **sie** wieder auf — mit demselben Agenten im selben Scope, Frage und Antwort im Prompt.
 * Alles andere geht über den Chat, damit die Antwort dort sichtbar bleibt.
 */
function resume(question: AgentQuestion): void {
  if (isWaitingForQuestion(question.ticketId)) {
    log.info('Antwort übernimmt die Arbeitsphase', {
      id: question.id,
      ticketId: question.ticketId,
    })
    return
  }

  if (!resumeChatRun) {
    log.warn('Kein Weg zur Fortsetzung eingehängt', { id: question.id })
    return
  }

  void Promise.resolve(resumeChatRun(question)).catch((error: unknown) => {
    log.error('Lauf konnte nach der Antwort nicht fortgesetzt werden', {
      id: question.id,
      ...describeError(error),
    })
  })
}

/**
 * Schließt alle Fragen, deren Frist abgelaufen ist. Der Zeitpunkt kommt von außen, damit der
 * Verfall prüfbar ist, ohne sieben Tage zu warten. Fortgesetzt wird dabei **nichts** über den
 * Chat: niemand hat geantwortet, und ein Lauf, der von selbst losliefe, wäre das Gegenteil
 * von dem, was A3 will. Ein Ticket einer laufenden Arbeitsphase nimmt diese selbst wieder
 * auf — sie sieht die geschlossene Frage im nächsten Durchlauf.
 */
export function expireOverdue(now: number = Date.now()): AgentQuestion[] {
  const overdue = listOverdueQuestions(new Date(now).toISOString())
  const expired: AgentQuestion[] = []

  for (const question of overdue) {
    const closed = closeQuestion(question.id, 'expired', null)
    if (!closed) continue
    expired.push(closed)
    publish(closed, 'updated')
  }

  if (expired.length > 0) {
    log.info('Rückfragen verfallen', { count: expired.length })
  }
  return expired
}

// ---------------------------------------------------------------------------
// Fristenwächter
// ---------------------------------------------------------------------------

let sweepTimer: NodeJS.Timeout | null = null

/** Einmal beim Start und danach stündlich. Mehr braucht eine Frist von sieben Tagen nicht. */
export function startExpirySweeper(): void {
  if (sweepTimer) return
  sweep()
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Ein Wecker, der die App am Beenden hindert, wäre ein Fehler.
  sweepTimer.unref?.()
}

export function stopExpirySweeper(): void {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}

function sweep(): void {
  try {
    expireOverdue()
  } catch (error) {
    log.error('Fristenprüfung fehlgeschlagen', describeError(error))
  }
}

/** Nur für die Fortsetzung: Projekt und Agent einer Frage, oder `null`. */
export function resolveScope(question: AgentQuestion): {
  project: NonNullable<ReturnType<typeof getProject>>
  agent: NonNullable<ReturnType<typeof getAgent>>
} | null {
  const project = getProject(question.projectId)
  const agent = getAgent(question.agentId)
  if (!project || !agent) {
    log.warn('Frage ohne Projekt oder Agent — keine Fortsetzung', { id: question.id })
    return null
  }
  return { project, agent }
}

import { formatTime } from '@shared/i18n'
import type { IpcEventName, IpcEventPayload } from '@shared/ipc-contract'
import type { ChatMessage, Goal, JsonObject } from '@shared/types'
import { getLanguage, getSettings, mainT } from '../app/settings'
import { getAgent } from '../db/repositories/agents'
import { getGoal } from '../db/repositories/goals'
import { getTicket } from '../db/repositories/tickets'
import { observeEvents } from '../ipc/events'
import { describeError, scopedLogger } from '../Logger'
import { sendActivity, sendAlert } from './PushService'
import type { ActivityState } from './payload'
import { ActivityThrottle } from './throttle'

const log = scopedLogger('push.notify')

/**
 * Was eine Meldung wert ist. Diese Schicht hängt sich an **dieselben** Ereignisse, die die
 * Brücke schon verteilt (`observeEvents`) — es gibt keinen neuen Weg in die Services, und
 * niemand ruft von hier aus in den Goal-Loop zurück.
 *
 * Bewusst **nicht** bei jedem `goal.activity`: das Ereignis kommt bei jedem Werkzeugaufruf.
 * Es wird nur zur Live Activity, und die ist gedrosselt.
 */

/** Was wir vom letzten Stand eines Vorhabens wissen, um einen Übergang zu erkennen. */
interface GoalMemory {
  status: Goal['status']
  phase: string | null
  resumeAt: string | null
}

const goals = new Map<number, GoalMemory>()

/**
 * Nachrichten, deren Ende schon gemeldet wurde. `chat.message` kommt beim Abschluss unter
 * Umständen mehrfach (Status und letzter Textbrocken); gemeldet wird einmal.
 */
const announcedMessages = new Set<string>()
const ANNOUNCED_LIMIT = 200

let unobserve: (() => void) | null = null

const throttle = new ActivityThrottle((_goalId, state, event, immediate) => {
  void sendActivity(state, event, immediate).catch((error: unknown) => {
    log.error('Live Activity konnte nicht geschickt werden', describeError(error))
  })
})

export function attach(): void {
  if (unobserve) return
  unobserve = observeEvents(onEvent)
  log.info('Hört auf Vorhaben und Chat')
}

export function detach(): void {
  unobserve?.()
  unobserve = null
  throttle.dispose()
  goals.clear()
  announcedMessages.clear()
}

export function isAttached(): boolean {
  return unobserve !== null
}

/**
 * Der Eintrittspunkt. Alles ab hier läuft in `try/catch`: ein Fehler in dieser Kette darf
 * keinen Agentenlauf anhalten, und `emitEvent` ruft uns mitten in einem Lauf.
 */
export function onEvent(event: IpcEventName, payload: unknown): void {
  // Ausgeschaltet heißt ausgeschaltet: hier wird nicht einmal eine Nutzlast gebaut.
  if (!getSettings().pushEnabled) return

  try {
    switch (event) {
      case 'goal.changed':
        onGoalChanged(payload as IpcEventPayload<'goal.changed'>)
        return
      case 'goal.activity':
        onGoalActivity(payload as IpcEventPayload<'goal.activity'>)
        return
      case 'goal.log':
        onGoalLog(payload as IpcEventPayload<'goal.log'>)
        return
      case 'chat.message':
        onChatMessage(payload as IpcEventPayload<'chat.message'>)
        return
      case 'question.changed':
        onQuestionChanged(payload as IpcEventPayload<'question.changed'>)
        return
      default:
        return
    }
  } catch (error) {
    log.error('Ereignis konnte nicht ausgewertet werden', { event, ...describeError(error) })
  }
}

// ---------------------------------------------------------------------------
// Vorhaben
// ---------------------------------------------------------------------------

const ENDED: readonly Goal['status'][] = ['done', 'cancelled', 'failed']

function onGoalChanged(payload: IpcEventPayload<'goal.changed'>): void {
  const goal = payload.goal
  if (!goal) {
    goals.delete(payload.goalId)
    throttle.forget(payload.goalId)
    return
  }

  const previous = goals.get(goal.id) ?? null
  const resumeAt = readResumeAt(goal.checkpoint)
  goals.set(goal.id, { status: goal.status, phase: goal.phase, resumeAt })

  const triggers = getSettings().pushTriggers
  const t = mainT()

  if (ENDED.includes(goal.status) && previous?.status !== goal.status) {
    // Erst die Karte am Sperrbildschirm beenden, dann die Meldung — sonst zeigt die Karte
    // für einen Moment einen Lauf, der schon vorbei ist.
    if (triggers.liveActivity) throttle.end(goal.id, stateOf(goal, null, null))

    if (goal.status === 'done' && triggers.goalDone) {
      const count = completedCount(goal)
      void alert({
        kind: 'goal.done',
        title: t('main.push.goalDone.title'),
        body: t('main.push.goalDone.body', { title: goal.title, count }),
        goal,
        collapseId: `goal-${goal.id}-end`,
      })
    } else if (goal.status === 'failed' && triggers.goalFailed) {
      void alert({
        kind: 'goal.failed',
        title: t('main.push.goalFailed.title'),
        body: t('main.push.goalFailed.body', {
          type: goal.errorType ?? '—',
          message: goal.errorMessage ?? goal.title,
        }),
        goal,
        collapseId: `goal-${goal.id}-end`,
      })
    } else if (goal.status === 'cancelled' && triggers.goalCancelled) {
      void alert({
        kind: 'goal.cancelled',
        title: t('main.push.goalCancelled.title'),
        body: t('main.push.goalCancelled.body', { title: goal.title }),
        goal,
        collapseId: `goal-${goal.id}-end`,
      })
    }
    return
  }

  // Eine Rate-Limit-Pause hinterlässt eine Wiederaufnahmezeit im Checkpoint. Das ist der
  // Zustand, auf den wir hören — nicht der Wortlaut einer Protokollzeile.
  if (triggers.rateLimit && resumeAt !== null && previous?.resumeAt !== resumeAt) {
    void alert({
      kind: 'goal.rateLimit',
      title: t('main.push.rateLimit.title'),
      body: t('main.push.rateLimit.body', { title: goal.title, time: formatTime(getLanguage(), resumeAt) }),
      goal,
      collapseId: `goal-${goal.id}-ratelimit`,
    })
  }

  // Phasenwechsel: sofort, ungedrosselt. Genau dafür sieht man auf den Sperrbildschirm.
  if (triggers.liveActivity && previous !== null && previous.phase !== goal.phase) {
    throttle.update(goal.id, stateOf(goal, null, null), true)
  }
}

function onGoalActivity(payload: IpcEventPayload<'goal.activity'>): void {
  if (!getSettings().pushTriggers.liveActivity) return

  const goal = getGoal(payload.goalId)
  if (!goal) return

  // Gedrosselt: höchstens eine Aktualisierung alle fünf Sekunden je Vorhaben.
  throttle.update(goal.id, stateOf(goal, payload.agentId, payload.ticketId, payload.tool))
}

function onGoalLog(payload: IpcEventPayload<'goal.log'>): void {
  if (!getSettings().pushTriggers.ticketStuck) return
  // Ein liegengebliebenes Ticket ist eine gescheiterte Zeile **mit** Ticket. Ohne Ticket ist
  // es das Vorhaben selbst, und das meldet `goal.changed` schon.
  if (payload.status !== 'failed' || payload.ticketId === null) return

  const ticket = getTicket(payload.ticketId)
  if (!ticket) return

  const t = mainT()
  void alert({
    kind: 'ticket.stuck',
    title: t('main.push.ticketStuck.title', { number: ticket.number }),
    body: t('main.push.ticketStuck.body', { title: ticket.title, message: payload.message }),
    projectId: ticket.projectId,
    goalId: payload.goalId,
    ticketNumber: ticket.number,
    collapseId: `ticket-${ticket.id}-stuck`,
  })
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function onChatMessage(payload: IpcEventPayload<'chat.message'>): void {
  if (!getSettings().pushTriggers.chatDone) return

  const message = payload.message as ChatMessage
  if (message.role !== 'agent' || message.status === 'streaming') return
  if (announcedMessages.has(message.id)) return

  remember(message.id)

  const agent = message.agentId === null ? null : getAgent(message.agentId)
  const t = mainT()
  void alert({
    kind: 'chat.done',
    title:
      message.status === 'error'
        ? t('main.notify.failed', { name: agent?.name ?? '—' })
        : t('main.notify.done', { name: agent?.name ?? '—' }),
    body: shorten(message.content) || t('main.notify.doneFallback'),
    projectId: message.projectId,
    collapseId: `chat-${message.projectId}`,
  })
}

function remember(messageId: string): void {
  announcedMessages.add(messageId)
  if (announcedMessages.size <= ANNOUNCED_LIMIT) return
  // Die ältesten fallen heraus; eine Nachricht, die so lange zurückliegt, kommt nicht wieder.
  const excess = announcedMessages.size - ANNOUNCED_LIMIT
  let removed = 0
  for (const id of announcedMessages) {
    announcedMessages.delete(id)
    removed += 1
    if (removed >= excess) break
  }
}

// ---------------------------------------------------------------------------
// Rückfragen (A3)
// ---------------------------------------------------------------------------

/**
 * Nur eine **neue** Frage ist eine Meldung wert. Beantwortet, verworfen oder verfallen hat
 * der Nutzer selbst ausgelöst oder nicht erlebt — beides braucht kein Push.
 */
function onQuestionChanged(payload: IpcEventPayload<'question.changed'>): void {
  if (!getSettings().pushTriggers.questionAsked) return
  if (payload.action !== 'created') return

  const question = payload.question
  const agent = getAgent(question.agentId)
  const ticket = question.ticketId === null ? null : getTicket(question.ticketId)
  const t = mainT()

  void alert({
    kind: 'question.open',
    title:
      ticket === null
        ? t('main.push.question.title', { name: agent?.name ?? '—' })
        : t('main.push.question.titleTicket', {
            name: agent?.name ?? '—',
            number: ticket.number,
          }),
    body: shorten(question.question),
    projectId: question.projectId,
    goalId: question.goalId,
    ticketNumber: ticket?.number ?? null,
    // Jede Frage ist ihr eigener Anlass — eine zweite darf die erste nicht ersetzen.
    collapseId: `question-${question.id}`,
  })
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

interface AlertArgs {
  kind: Parameters<typeof sendAlert>[0]['kind']
  title: string
  body: string
  goal?: Goal
  projectId?: string
  goalId?: number | null
  ticketNumber?: number | null
  collapseId: string
}

function alert(args: AlertArgs): Promise<void> {
  return sendAlert({
    kind: args.kind,
    title: args.title,
    body: args.body,
    projectId: args.projectId ?? args.goal?.projectId ?? null,
    goalId: args.goalId ?? args.goal?.id ?? null,
    ticketNumber: args.ticketNumber ?? null,
    collapseId: args.collapseId,
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      // Der Versand verspricht, nicht zu werfen. Falls doch, endet es hier und nicht im Lauf.
      log.error('Meldung konnte nicht geschickt werden', { kind: args.kind, ...describeError(error) })
    })
}

/** Der Zustand für die Karte am Sperrbildschirm. */
function stateOf(
  goal: Goal,
  agentId: string | null,
  ticketId: string | null,
  tool: string | null = null,
): ActivityState {
  const checkpoint = goal.checkpoint
  const ticket = ticketId === null ? null : getTicket(ticketId)
  const agent = agentId === null ? null : getAgent(agentId)

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    projectId: goal.projectId,
    phase: goal.phase ?? 'work',
    status: goal.status,
    agentName: agent?.name ?? null,
    ticketNumber: ticket?.number ?? null,
    ticketTitle: ticket?.title ?? null,
    tool,
    completed: numberAt(checkpoint, 'completedTickets'),
    total: numberAt(checkpoint, 'totalTickets'),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Wie viele Tickets erledigt sind. `completedTickets` ist der Zähler des Checkpoints;
 * `doneTicketIds` ist die Liste. Die Liste ist die verlässlichere Angabe, der Zähler die
 * ältere — es gilt der größere Wert, damit „0 Tickets erledigt" bei einem fertigen Vorhaben
 * nicht vorkommt.
 */
function completedCount(goal: Goal): number {
  const checkpoint = goal.checkpoint
  const counter = numberAt(checkpoint, 'completedTickets')
  const list = checkpoint === null ? null : checkpoint.doneTicketIds
  const listed = Array.isArray(list) ? list.length : 0
  return Math.max(counter, listed)
}

function numberAt(checkpoint: JsonObject | null, key: string): number {
  const value = checkpoint === null ? undefined : checkpoint[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readResumeAt(checkpoint: JsonObject | null): string | null {
  const value = checkpoint === null ? undefined : checkpoint.resumeAt
  return typeof value === 'string' && value !== '' ? value : null
}

const MAX_BODY_LENGTH = 220

function shorten(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= MAX_BODY_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_BODY_LENGTH - 1).trimEnd()}…`
}

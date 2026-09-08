import { nowIso, withTransaction } from '../db/connection'
import { getDocument } from '../db/repositories/documents'
import {
  appendGoalLog,
  createGoal,
  getGoal,
  listActiveGoals,
  listGoalLog,
  listGoals,
  updateGoal,
} from '../db/repositories/goals'
import { getTicket, listTickets } from '../db/repositories/tickets'
import { RateLimitError, killByFilter } from '../claude'
import * as projects from '../projects/ProjectService'
import * as tickets from '../tickets/TicketService'
import { emitEvent } from '../ipc/events'
import { describeError, scopedLogger } from '../Logger'
import { createGoalContext, emitGoalChanged, transition, type GoalContext } from './context'
import { runSpecPhase } from './phases/spec'
import { runTicketsPhase } from './phases/tickets'
import { runReviewPhase } from './phases/review'
import { runWorkPhase } from './WorkerPool'
import { GoalAbortedError, throwIfAborted } from './runAgent'
import { emptyCheckpoint, readCheckpoint, type GoalCheckpoint, type GoalPhase } from './types'
import type { Goal, GoalLogEntry, Project, Ticket } from '@shared/types'

const log = scopedLogger('goals')

/** So oft darf die Abnahme Nacharbeit verlangen, bevor das Vorhaben aufgibt. */
const MAX_REVIEW_CYCLES = 3

/** Ein Abbruchsignal je laufendem Vorhaben — mehr Zustand hält die Engine nicht im Speicher. */
const running = new Map<number, AbortController>()

/** Beim Beenden abgebrochene Läufe sind kein Abbruch durch den Nutzer — sie werden fortgesetzt. */
let shuttingDown = false

// --- Abfragen ---------------------------------------------------------------

export function list(projectId: string): Goal[] {
  return listGoals(projectId)
}

export function get(id: number): Goal | null {
  return getGoal(id)
}

export function logEntries(goalId: number, limit?: number): GoalLogEntry[] {
  return listGoalLog(goalId, limit)
}

// --- Start ------------------------------------------------------------------

export interface StartFromDescriptionInput {
  projectId: string
  description: string
  title?: string
  selectedAgentIds?: string[]
}

/** Modus `ai`: beginnt beim Pflichtenheft und läuft bis zur Abnahme. */
export function startFromDescription(input: StartFromDescriptionInput): Goal {
  const project = requireProject(input.projectId)
  const description = input.description.trim()

  const goal = createGoal({
    projectId: project.id,
    title: input.title?.trim() || deriveTitle(description),
    description,
    mode: 'ai',
    status: 'planning',
    phase: 'spec',
    selectedAgentIds: input.selectedAgentIds ?? [],
  })
  const started = updateGoal(goal.id, { checkpoint: emptyCheckpoint('spec') })

  announce(started, 'Vorhaben gestartet — das Pflichtenheft entsteht als Erstes')
  void execute(started.id)
  return started
}

export interface StartFromTicketsInput {
  projectId: string
  ticketIds: string[]
  title?: string
  selectedAgentIds?: string[]
}

/** Modus `selected`: arbeitet vorhandene Tickets ab, ohne Planung und ohne Abnahme. */
export function startFromTickets(input: StartFromTicketsInput): Goal {
  const project = requireProject(input.projectId)

  const chosen = input.ticketIds
    .map((id) => getTicket(id))
    .filter((ticket): ticket is Ticket => ticket !== null && ticket.projectId === project.id)
  if (chosen.length === 0) {
    throw new Error('Keines der ausgewählten Tickets gehört zu diesem Projekt.')
  }

  const goal = withTransaction(() => {
    const created = createGoal({
      projectId: project.id,
      title: input.title?.trim() || deriveTicketTitle(chosen.length),
      description: `Abarbeitung von ${chosen.length} ausgewählten Tickets.`,
      mode: 'selected',
      status: 'in_progress',
      phase: 'work',
      selectedAgentIds: input.selectedAgentIds ?? [],
    })
    return updateGoal(created.id, {
      checkpoint: {
        ...emptyCheckpoint('work'),
        ticketIds: chosen.map((ticket) => ticket.id),
        totalTickets: chosen.length,
        doneTicketIds: chosen.filter((t) => t.status === 'done').map((t) => t.id),
        completedTickets: chosen.filter((t) => t.status === 'done').length,
      },
    })
  })

  for (const ticket of chosen) {
    if (ticket.goalId !== goal.id) tickets.update(ticket.id, { goalId: goal.id })
  }

  announce(goal, `Vorhaben gestartet — ${chosen.length} Tickets werden abgearbeitet`)
  void execute(goal.id)
  return goal
}

// --- Steuerung --------------------------------------------------------------

/** Bricht das Signal ab und beendet zusätzlich alle Läufe, die noch am Vorhaben hängen. */
export function cancel(goalId: number): Goal {
  const goal = getGoal(goalId)
  if (!goal) throw new Error(`Vorhaben ${goalId} existiert nicht.`)

  running.get(goalId)?.abort()
  const killed = killByFilter((info) => info.scope.goalId === goalId)

  const updated = markCancelled(goalId)
  log.info('Vorhaben abgebrochen', { goalId, killed })
  return updated
}

/** Nimmt ein gescheitertes oder abgebrochenes Vorhaben an seinem Checkpoint wieder auf. */
export function retry(goalId: number): Goal {
  const goal = getGoal(goalId)
  if (!goal) throw new Error(`Vorhaben ${goalId} existiert nicht.`)
  if (running.has(goalId)) throw new Error('Dieses Vorhaben läuft bereits.')

  const phase = resumePhase(goal)
  const updated = updateGoal(goalId, {
    errorType: null,
    errorMessage: null,
    completedAt: null,
    retryCount: 0,
    // Ein Wiederaufnehmen von Hand ist ein echter Neuanfang: Versuchszähler und
    // liegengebliebene Tickets werden zurückgesetzt, sonst bliebe alles liegen.
    checkpoint: {
      ...checkpointOf(goal),
      phase,
      activeTickets: [],
      resumeAt: null,
      attempts: {},
      triedAgents: {},
      requeues: {},
      stuckTicketIds: [],
      revivedTicketIds: [],
    },
    phase,
    status: 'pending',
  })
  emitGoalChanged(updated)

  appendLine(goalId, phase, 'Vorhaben wird erneut aufgenommen')
  void execute(goalId)
  return updated
}

/** Beim App-Start: alles, was beim Beenden noch lief, aus dem Checkpoint fortsetzen. */
export function resumeInterrupted(): void {
  for (const goal of listActiveGoals()) {
    if (running.has(goal.id)) continue
    const phase = resumePhase(goal)
    appendLine(goal.id, phase, 'Vorhaben wird nach dem Neustart fortgesetzt')
    log.info('Unterbrochenes Vorhaben wird fortgesetzt', { goalId: goal.id, phase })
    void execute(goal.id)
  }
}

/** Beim Beenden: laufende Vorhaben anhalten, ohne sie als abgebrochen zu markieren. */
export function shutdown(): void {
  shuttingDown = true
  for (const controller of running.values()) controller.abort()
  running.clear()
}

// --- Zustandsmaschine -------------------------------------------------------

async function execute(goalId: number): Promise<void> {
  if (running.has(goalId)) return

  const controller = new AbortController()
  running.set(goalId, controller)

  try {
    const goal = getGoal(goalId)
    if (!goal) return
    const project = requireProject(goal.projectId)
    await drive(createGoalContext(goal, project, controller.signal))
  } catch (error) {
    // Beim Beenden bleibt der Status stehen, damit `resumeInterrupted` wieder anknüpfen kann.
    if (shuttingDown) return
    if (error instanceof GoalAbortedError || controller.signal.aborted) {
      markCancelled(goalId)
    } else {
      markFailed(goalId, error)
    }
  } finally {
    running.delete(goalId)
  }
}

async function drive(ctx: GoalContext): Promise<void> {
  let phase: GoalPhase = ctx.checkpoint().phase
  let spec: string | null = null

  while (true) {
    throwIfAborted(ctx.signal)

    switch (phase) {
      case 'spec': {
        transition(ctx.goalId, 'spec', { resumeAt: null })
        spec = await runSpecPhase(ctx)
        phase = 'tickets'
        break
      }
      case 'tickets': {
        transition(ctx.goalId, 'tickets', { resumeAt: null })
        await runTicketsPhase(ctx, spec ?? loadSpec(ctx))
        phase = 'work'
        break
      }
      case 'work': {
        transition(ctx.goalId, 'work', { resumeAt: null, activeTickets: [] })
        await runWorkPhase(ctx)
        phase = ctx.goal().mode === 'selected' ? 'done' : 'review'
        break
      }
      case 'review': {
        transition(ctx.goalId, 'review', { resumeAt: null, activeTickets: [] })
        if ((await runReviewPhase(ctx)) === 'complete') {
          phase = 'done'
          break
        }
        const cycle = ctx.goal().retryCount + 1
        emitGoalChanged(updateGoal(ctx.goalId, { retryCount: cycle }))
        if (cycle > MAX_REVIEW_CYCLES) {
          throw new Error(
            `Die Abnahme verlangt nach ${MAX_REVIEW_CYCLES} Durchläufen immer noch Nacharbeit.`,
          )
        }
        ctx.log({ message: `Nacharbeit, Runde ${cycle}`, phase: 'review' })
        phase = 'work'
        break
      }
      case 'done': {
        finish(ctx)
        return
      }
    }
  }
}

function finish(ctx: GoalContext): void {
  const done = listTickets({ projectId: ctx.project.id, goalId: ctx.goalId }).filter(
    (ticket) => ticket.status === 'done',
  ).length

  const goal = withTransaction(() =>
    updateGoal(ctx.goalId, {
      phase: 'done',
      status: 'done',
      completedAt: nowIso(),
      errorType: null,
      errorMessage: null,
      checkpoint: { ...checkpointOf(ctx.goal()), phase: 'done', activeTickets: [], resumeAt: null },
    }),
  )
  emitGoalChanged(goal)
  ctx.log({ message: `Vorhaben abgeschlossen — ${done} Tickets erledigt`, phase: 'done', status: 'success' })
  log.info('Vorhaben abgeschlossen', { goalId: ctx.goalId })
}

function markCancelled(goalId: number): Goal {
  const goal = getGoal(goalId)
  if (!goal) throw new Error(`Vorhaben ${goalId} existiert nicht.`)
  if (goal.status === 'cancelled') return goal

  const updated = withTransaction(() =>
    updateGoal(goalId, {
      status: 'cancelled',
      completedAt: nowIso(),
      checkpoint: { ...checkpointOf(goal), activeTickets: [], resumeAt: null },
    }),
  )
  emitGoalChanged(updated)
  appendLine(goalId, checkpointOf(goal).phase, 'Vorhaben abgebrochen', 'failed')
  return updated
}

function markFailed(goalId: number, error: unknown): void {
  const goal = getGoal(goalId)
  if (!goal) return

  const rateLimit = error instanceof RateLimitError
  const message = error instanceof Error ? error.message : String(error)

  const updated = withTransaction(() =>
    updateGoal(goalId, {
      status: 'failed',
      completedAt: nowIso(),
      errorType: rateLimit ? 'Rate-Limit' : 'Fehler',
      errorMessage: message,
      checkpoint: { ...checkpointOf(goal), activeTickets: [], resumeAt: null },
    }),
  )
  emitGoalChanged(updated)
  appendLine(goalId, checkpointOf(goal).phase, message, 'failed')
  log.error('Vorhaben fehlgeschlagen', { goalId, ...describeError(error) })
}

// --- Hilfen -----------------------------------------------------------------

function requireProject(projectId: string): Project {
  const project = projects.get(projectId)
  if (!project) throw new Error(`Projekt ${projectId} existiert nicht.`)

  const warning = projects.checkPath(project.path)
  if (warning) throw new Error(`${warning} Ohne gültigen Projektpfad kann kein Vorhaben laufen.`)
  return project
}

/** Der Checkpoint eines Vorhabens; ohne gespeicherten Stand entscheidet der Modus. */
function checkpointOf(goal: Goal): GoalCheckpoint {
  return readCheckpoint(goal.checkpoint, goal.mode === 'ai' ? 'spec' : 'work')
}

/** Wo ein Vorhaben wieder einsteigt: dort, wo der Checkpoint stehen geblieben ist. */
function resumePhase(goal: Goal): GoalPhase {
  const phase = checkpointOf(goal).phase
  if (phase !== 'done') return phase
  return goal.mode === 'ai' ? 'review' : 'work'
}

function loadSpec(ctx: GoalContext): string | null {
  const goal = ctx.goal()
  if (!goal.specDocumentId) return null
  return getDocument(goal.specDocumentId)?.content ?? null
}

function announce(goal: Goal, message: string): void {
  emitGoalChanged(goal, 'created')
  appendLine(goal.id, checkpointOf(goal).phase, message)
  log.info('Vorhaben angelegt', { goalId: goal.id, mode: goal.mode, projectId: goal.projectId })
}

function appendLine(
  goalId: number,
  phase: GoalPhase,
  message: string,
  status: GoalLogEntry['status'] = 'running',
): void {
  const entry = appendGoalLog({ goalId, phase, message, status })
  emitEvent('goal.log', entry)
}

function deriveTitle(description: string): string {
  const line = description.split('\n').find((entry) => entry.trim().length > 0)?.trim() ?? 'Vorhaben'
  const clean = line.replace(/^#+\s*/, '')
  return clean.length > 80 ? `${clean.slice(0, 80).trimEnd()}…` : clean
}

function deriveTicketTitle(count: number): string {
  return `${count} Ticket${count === 1 ? '' : 's'} abarbeiten`
}

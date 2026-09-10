import { withTransaction } from '../db/connection'
import { appendGoalLog, getGoal, updateGoal } from '../db/repositories/goals'
import { emitEvent } from '../ipc/events'
import { readCheckpoint, type GoalCheckpoint, type GoalPhase } from './types'
import type { Goal, GoalLogStatus, Project } from '@shared/types'
import { formatTimeWithSeconds } from '@shared/i18n'
import { getLanguage, mainT } from '../app/settings'

export interface GoalLogInput {
  message: string
  status?: GoalLogStatus
  phase?: GoalPhase | null
  agentId?: string | null
  ticketId?: string | null
}

/** Alles, was eine Phase über ihr Vorhaben wissen und an ihm ändern darf. */
export interface GoalContext {
  goalId: number
  project: Project
  signal: AbortSignal
  goal(): Goal
  checkpoint(): GoalCheckpoint
  patchCheckpoint(patch: Partial<GoalCheckpoint>): GoalCheckpoint
  log(input: GoalLogInput): void
}

export function createGoalContext(goal: Goal, project: Project, signal: AbortSignal): GoalContext {
  const goalId = goal.id

  const current = (): Goal => {
    const found = getGoal(goalId)
    if (!found) throw new Error(`Vorhaben ${goalId} existiert nicht mehr.`)
    return found
  }

  return {
    goalId,
    project,
    signal,
    goal: current,
    checkpoint: () => {
      const found = current()
      return readCheckpoint(found.checkpoint, phaseOf(found))
    },
    patchCheckpoint: (patch) => {
      const found = current()
      const next: GoalCheckpoint = { ...readCheckpoint(found.checkpoint, phaseOf(found)), ...patch }
      emitGoalChanged(updateGoal(goalId, { checkpoint: next }))
      return next
    },
    log: (input) => {
      const entry = appendGoalLog({
        goalId,
        message: input.message,
        phase: input.phase ?? phaseOf(current()),
        agentId: input.agentId ?? null,
        ticketId: input.ticketId ?? null,
        status: input.status ?? 'running',
      })
      emitEvent('goal.log', entry)
    },
  }
}

/** Phase, Status und Checkpoint gehören zusammen — sie wandern in einem Schritt. */
export function transition(
  goalId: number,
  phase: GoalPhase,
  patch: Partial<GoalCheckpoint> = {},
): Goal {
  const goal = withTransaction(() => {
    const found = getGoal(goalId)
    if (!found) throw new Error(`Vorhaben ${goalId} existiert nicht mehr.`)
    const checkpoint: GoalCheckpoint = {
      ...readCheckpoint(found.checkpoint, phase),
      ...patch,
      phase,
    }
    return updateGoal(goalId, { phase, status: statusForPhase(phase), checkpoint })
  })
  emitGoalChanged(goal)
  return goal
}

export function emitGoalChanged(goal: Goal, action: 'created' | 'updated' | 'removed' = 'updated'): void {
  emitEvent('goal.changed', {
    projectId: goal.projectId,
    goalId: goal.id,
    goal: action === 'removed' ? null : goal,
    action,
  })
}

export function statusForPhase(phase: GoalPhase): Goal['status'] {
  switch (phase) {
    case 'spec':
    case 'tickets':
      return 'planning'
    case 'work':
      return 'in_progress'
    case 'review':
      return 'reviewing'
    case 'done':
      return 'done'
  }
}

function phaseOf(goal: Goal): GoalPhase {
  const checkpoint = readCheckpoint(goal.checkpoint, goal.mode === 'ai' ? 'spec' : 'work')
  return checkpoint.phase
}

/**
 * Einheitliche Behandlung einer Rate-Limit-Pause: Wiederaufnahmezeit in den Checkpoint,
 * Zustand ins Protokoll. Die Oberfläche erkennt daran, dass das Vorhaben nur wartet.
 */
export function reportRateLimit(
  ctx: GoalContext,
  phase: GoalPhase,
  agentId: string,
  what: string,
): (input: { waitMs: number; attempt: number; resumeAt: string }) => void {
  return ({ resumeAt, attempt }) => {
    ctx.patchCheckpoint({ resumeAt })
    ctx.log({
      message: mainT()('main.goalLog.rateLimit', {
        what,
        time: formatTime(resumeAt),
        attempt,
      }),
      phase,
      agentId,
    })
  }
}

/**
 * Meldet der Oberfläche, was ein Agent gerade tut. Bewusst nur als Ereignis — jeder
 * Werkzeugaufruf in den Checkpoint zu schreiben wäre reine Verschwendung.
 */
export function reportActivity(
  goalId: number,
  agentId: string,
  ticketId: string | null,
): (tool: string | null) => void {
  return (tool) => {
    emitEvent('goal.activity', { goalId, agentId, ticketId, tool, since: new Date().toISOString() })
  }
}

function formatTime(iso: string): string {
  return formatTimeWithSeconds(getLanguage(), iso)
}

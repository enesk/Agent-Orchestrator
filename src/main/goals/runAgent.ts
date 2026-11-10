import { RateLimitError, run as runClaude } from '../claude'
import { toolLabel } from '../chat'
import { withRunContext, type GoalReport } from '../mcp'
import { createMessage } from '../db/repositories/messages'
import { listSkillsForAgent } from '../db/repositories/skills'
import { emitEvent } from '../ipc/events'
import { describeError, scopedLogger } from '../Logger'
import { buildSystemAppend } from './prompts'
import type { Agent, Project } from '@shared/types'

const log = scopedLogger('goals.run')

/** So oft wird ein Lauf nach einem Rate-Limit erneut angesetzt, bevor er aufgibt. */
const MAX_RATE_LIMIT_ATTEMPTS = 10
/** Die Wartezeit wächst mit dem Versuchszähler, aber nicht unbegrenzt. */
const MAX_BACKOFF_FACTOR = 3

/** Wird geworfen, wenn `cancel()` einen Lauf oder eine Wartezeit unterbricht. */
export class GoalAbortedError extends Error {
  constructor() {
    super('Das Vorhaben wurde abgebrochen.')
    this.name = 'GoalAbortedError'
  }
}

export interface GoalRunInput {
  goalId: number
  project: Project
  agent: Agent
  /** Was der Agent in genau diesem Schritt tun soll — landet im Systemprompt. */
  roleNote: string
  prompt: string
  label: string
  ticketId?: string | null
  /** Kurze Zeile für den Chat-Verlauf; der Prompt selbst bleibt draußen. */
  chatLine?: string | null
  signal: AbortSignal
  /** Meldet eine Rate-Limit-Pause, damit sie im Protokoll und im Checkpoint landet. */
  onRateLimit?: (input: { waitMs: number; attempt: number; resumeAt: string }) => void
  /**
   * Meldet, was der Lauf gerade tut — `null` heißt „überlegt". Läuft nur über Ereignisse
   * an die Oberfläche, nicht in den Checkpoint.
   */
  onActivity?: (tool: string | null) => void
}

export interface GoalRunResult {
  text: string
  report: GoalReport | null
  /**
   * IDs der Rückfragen, die dieser Lauf über `ask_user` gestellt hat (A3). Nicht leer heißt:
   * der Lauf ist nicht fertig, sondern wartet auf eine Entscheidung.
   */
  questionIds: string[]
  aborted: boolean
}

/**
 * Ein Lauf des Vorhabens. Er geht direkt an den `ClaudeRunner` — nicht über eine
 * Chat-Nachricht, deren Wirkung man sich hinterher aus der Datenbank zusammensuchen müsste.
 */
export async function runGoalAgent(input: GoalRunInput): Promise<GoalRunResult> {
  throwIfAborted(input.signal)

  if (input.chatLine) postSystemLine(input.project.id, input.agent.id, input.goalId, input.chatLine)

  const systemPromptAppend = buildSystemAppend(input.agent, input.project.id, input.roleNote)
  const cwd = input.project.path ?? ''

  for (let attempt = 1; ; attempt += 1) {
    throwIfAborted(input.signal)
    try {
      return await execute(input, systemPromptAppend, cwd)
    } catch (error) {
      if (!(error instanceof RateLimitError) || attempt >= MAX_RATE_LIMIT_ATTEMPTS) throw error

      const waitMs = error.retryAfterMs * Math.min(attempt, MAX_BACKOFF_FACTOR)
      const resumeAt = new Date(Date.now() + waitMs).toISOString()
      log.warn('Rate-Limit, Lauf wird verschoben', {
        goalId: input.goalId,
        attempt,
        waitMs,
        label: input.label,
      })
      input.onRateLimit?.({ waitMs, attempt, resumeAt })
      await sleep(waitMs, input.signal)
    }
  }
}

function execute(
  input: GoalRunInput,
  systemPromptAppend: string,
  cwd: string,
): Promise<GoalRunResult> {
  const scope = {
    projectId: input.project.id,
    agentId: input.agent.id,
    goalId: input.goalId,
    ticketId: input.ticketId ?? null,
  }

  return withRunContext(scope, async (context) => {
    const claudeRun = runClaude({
      prompt: input.prompt,
      cwd,
      model: input.agent.model,
      effort: input.agent.effort,
      scope,
      mcp: context.mcp,
      systemPromptAppend,
      skills: listSkillsForAgent(input.agent.id),
      label: input.label,
    })

    const onAbort = (): void => claudeRun.abort()
    input.signal.addEventListener('abort', onAbort, { once: true })

    if (input.onActivity) {
      const report = input.onActivity
      report(null)
      claudeRun.events.on('toolStart', ({ name }) => report(toolLabel(name)))
      claudeRun.events.on('toolEnd', () => report(null))
    }

    try {
      const result = await claudeRun.done
      // Meldung und Rückfragen müssen geholt werden, solange das Token noch registriert ist.
      return {
        text: result.text,
        report: context.takeReport(),
        questionIds: context.takeQuestions(),
        aborted: result.aborted,
      }
    } catch (error) {
      if (input.signal.aborted) throw new GoalAbortedError()
      log.error('Lauf des Vorhabens fehlgeschlagen', {
        goalId: input.goalId,
        label: input.label,
        ...describeError(error),
      })
      throw error
    } finally {
      input.signal.removeEventListener('abort', onAbort)
      claudeRun.events.removeAll()
    }
  })
}

/** Der Chat sieht nur, dass etwas läuft — der vollständige Prompt landet nicht im Verlauf. */
function postSystemLine(
  projectId: string,
  agentId: string,
  goalId: number,
  content: string,
): void {
  const message = createMessage({
    projectId,
    role: 'system',
    agentId,
    content,
    metadata: { goalId },
  })
  emitEvent('chat.message', { projectId, message, delta: null })
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new GoalAbortedError()
}

/** Wartezeit, die ein Abbruch sofort beendet. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new GoalAbortedError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

import { observeRunLifecycle, type RunInfo, type RunOutcome } from '../claude'
import { toolLabel } from '../chat'
import { notify } from '../app/notifications'
import { getLanguage, mainT } from '../app/settings'
import { getAgent } from '../db/repositories/agents'
import { getGoal } from '../db/repositories/goals'
import { getProject } from '../db/repositories/projects'
import { getTicket } from '../db/repositories/tickets'
import { emitEvent, observeEvents } from '../ipc/events'
import { scopedLogger } from '../Logger'
import { formatDuration } from '@shared/i18n'
import type { IpcEventPayload } from '@shared/ipc-contract'
import type { ActiveRun } from '@shared/types'

const log = scopedLogger('runs.monitor')

/**
 * Die Live-Übersicht aller Läufe. Sie hält den Augenblick — wer läuft, seit wann, mit welchem
 * Werkzeug — und schreibt ihn über Ereignisse fort. Nichts davon gehört in die Datenbank: ein
 * Werkzeugaufruf pro Zeile wäre reine Verschwendung, und nach einem Neustart läuft ohnehin nichts.
 */
const runs = new Map<string, ActiveRun>()

/** Diese Läufe melden ihr Ende schon selbst — der Chat über `notifyAgentDone`. */
const SELF_ANNOUNCING_LABELS: readonly string[] = ['chat']

let detach: (() => void) | null = null
let detachQuestions: (() => void) | null = null

export function startRunMonitor(): void {
  if (detach) return
  detachQuestions = observeEvents((event, payload) => {
    if (event !== 'question.changed') return
    // `observeEvents` liefert den Satz ohne Typ; der Kanalname bürgt für die Form.
    onQuestionChanged(payload as IpcEventPayload<'question.changed'>)
  })
  detach = observeRunLifecycle({
    started: (info) => {
      const run = describe(info)
      // Läufe ohne Projekt in der Datenbank sind App-interne Einzelaufrufe — etwa die
      // Prompt-Erzeugung mit ihrem Pseudo-Projekt. Die hat Enes nie gestartet.
      if (!run) return
      runs.set(run.id, run)
      emitEvent('run.started', run)
    },

    activity: (info, tool) => {
      const existing = runs.get(info.id)
      if (!existing) return
      const label = tool === null ? null : toolLabel(tool)
      const since = new Date().toISOString()
      runs.set(info.id, { ...existing, tool: label, toolSince: since })
      emitEvent('run.activity', { id: info.id, tool: label, since })
    },

    finished: (info, outcome, durationMs) => {
      const existing = runs.get(info.id)
      if (!existing) return

      // Ein Lauf, der eine Rückfrage gestellt hat, ist beendet, aber nicht fertig: er bleibt
      // als wartende Zeile stehen, bis die Frage beantwortet, verworfen oder verfallen ist.
      // Nur ein Abbruch durch Enes nimmt die Zeile sofort mit — den hat er selbst ausgelöst.
      if (existing.waitingQuestionId !== null && outcome !== 'aborted') {
        emitEvent('run.waiting', existing)
        return
      }

      runs.delete(info.id)
      emitEvent('run.finished', {
        id: info.id,
        projectId: existing.projectId,
        outcome,
        finishedAt: new Date().toISOString(),
        durationMs,
      })
      announce(existing, outcome, durationMs)
    },
  })
  log.info('Live-Übersicht hört mit')
}

export function stopRunMonitor(): void {
  detach?.()
  detach = null
  detachQuestions?.()
  detachQuestions = null
  runs.clear()
}

/**
 * Rückfragen und Übersicht treffen sich hier. Eine neue Frage macht aus dem fragenden Lauf
 * eine wartende Zeile; ist die Frage geschlossen, verschwindet die Zeile. Die Antwort startet
 * denselben Agenten erneut — der kommt dann als neuer Lauf von vorn herein.
 */
function onQuestionChanged(payload: IpcEventPayload<'question.changed'>): void {
  const { question } = payload

  if (payload.action === 'created') {
    const run = findAsker(question.projectId, question.agentId, question.ticketId, question.goalId)
    // Ohne laufenden Lauf gibt es nichts zu markieren: die Frage steht dann nur im
    // Rückfragen-Bereich. Nach einem Neustart der App ist das der normale Fall.
    if (!run) return
    const waiting: ActiveRun = {
      ...run,
      waitingQuestionId: question.id,
      waitingSince: question.askedAt,
    }
    runs.set(run.id, waiting)
    emitEvent('run.waiting', waiting)
    log.info('Lauf wartet auf eine Antwort', { runId: run.id, questionId: question.id })
    return
  }

  if (question.status === 'open') return

  for (const run of [...runs.values()]) {
    if (run.waitingQuestionId !== question.id) continue
    runs.delete(run.id)
    emitEvent('run.finished', {
      id: run.id,
      projectId: run.projectId,
      // Kein Scheitern: die Frage ist vom Tisch, und der fortgesetzte Lauf meldet sich selbst.
      outcome: 'done',
      finishedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - Date.parse(run.startedAt)),
    })
  }
}

/**
 * Der Lauf, aus dem die Frage kommt. Das Werkzeug `ask_user` kennt keine Lauf-ID, wohl aber
 * seinen Scope — und in einem Scope arbeitet immer nur ein Lauf. Der jüngste passende gewinnt.
 */
function findAsker(
  projectId: string,
  agentId: string,
  ticketId: string | null,
  goalId: number | null,
): ActiveRun | null {
  let found: ActiveRun | null = null
  for (const run of runs.values()) {
    if (run.waitingQuestionId !== null) continue
    if (run.projectId !== projectId || run.agentId !== agentId) continue
    if (run.ticketId !== ticketId || run.goalId !== goalId) continue
    if (!found || run.startedAt >= found.startedAt) found = run
  }
  return found
}

/** Der Anfangsstand für ein frisch geöffnetes Fenster; fortgeschrieben wird per Ereignis. */
export function listActiveRuns(): ActiveRun[] {
  return [...runs.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function describe(info: RunInfo): ActiveRun | null {
  const project = getProject(info.scope.projectId)
  if (!project) return null

  const goalId = info.scope.goalId ?? null
  const goal = goalId === null ? null : getGoal(goalId)
  const ticketId = info.scope.ticketId ?? null
  const ticket = ticketId === null ? null : getTicket(ticketId)
  const startedAt = new Date(info.startedAt).toISOString()

  return {
    id: info.id,
    projectId: project.id,
    projectName: project.name,
    agentId: info.scope.agentId,
    agentName: getAgent(info.scope.agentId)?.name ?? info.scope.agentId,
    model: info.model,
    label: info.label,
    goalId,
    goalTitle: goal?.title ?? null,
    ticketId,
    ticketNumber: ticket?.number ?? null,
    ticketTitle: ticket?.title ?? null,
    startedAt,
    tool: null,
    toolSince: startedAt,
    waitingQuestionId: null,
    waitingSince: null,
  }
}

/**
 * Das Ende eines Laufs als Systembenachrichtigung — bisher hat Enes es nur gemerkt, wenn er
 * nachgesehen hat. Ein Abbruch durch ihn selbst bleibt still.
 */
function announce(run: ActiveRun, outcome: RunOutcome, durationMs: number): void {
  // Ein Abbruch kommt von Enes selbst, und eine Rate-Limit-Pause ist kein Ende — der Schritt
  // läuft danach als neuer Lauf weiter. Beides zu melden wäre nur Lärm.
  if (outcome === 'aborted' || outcome === 'rate_limited') return
  if (run.label !== null && SELF_ANNOUNCING_LABELS.includes(run.label)) return

  const t = mainT()
  const occasion =
    run.ticketNumber !== null
      ? `#${run.ticketNumber} ${run.ticketTitle ?? ''}`.trim()
      : (run.goalTitle ?? null)

  notify({
    // Dieselben Titel wie beim Chat — „fertig" heißt hier dasselbe, nur ohne Nachricht dazu.
    title: t(outcome === 'done' ? 'main.notify.done' : 'main.notify.failed', {
      name: run.agentName,
    }),
    body: [run.projectName, occasion, formatDuration(getLanguage(), durationMs)]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
  })
}

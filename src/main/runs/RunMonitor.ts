import { observeRunLifecycle, type RunInfo, type RunOutcome } from '../claude'
import { toolLabel } from '../chat'
import { notify } from '../app/notifications'
import { getLanguage, mainT } from '../app/settings'
import { getAgent } from '../db/repositories/agents'
import { getGoal } from '../db/repositories/goals'
import { getProject } from '../db/repositories/projects'
import { getTicket } from '../db/repositories/tickets'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import { formatDuration } from '@shared/i18n'
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

export function startRunMonitor(): void {
  if (detach) return
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
  runs.clear()
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

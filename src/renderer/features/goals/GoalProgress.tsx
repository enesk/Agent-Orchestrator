import { useMemo, useState } from 'react'
import type { Goal, GoalLogEntry, ProjectAgent, Ticket } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { useDocumentStore } from '../../store/documentStore'
import { useGoalStore, type GoalActivity } from '../../store/goalStore'
import { useUiStore } from '../../store/uiStore'
import { Badge, Button, formatDateTime, useConfirm } from '../../ui'
import { GoalLog } from './GoalLog'
import { PhaseBar } from './PhaseBar'
import {
  formatDuration,
  formatElapsed,
  goalStatusLabel,
  goalStatusTone,
  isGoalActive,
  isRateLimitPause,
  readActiveAssignments,
  ticketCounts,
  useNow,
} from './goalHelpers'

/** Stabile Leermenge, damit der Selektor ohne Aktivität nicht bei jedem Rendern neu meldet. */
const EMPTY_ACTIVITY: Record<string, GoalActivity> = {}

export interface GoalProgressProps {
  goal: Goal
  agents: ProjectAgent[]
  tickets: Ticket[]
  logEntries: GoalLogEntry[]
  logLoading: boolean
  logError: string | null
}

export function GoalProgress({
  goal,
  agents,
  tickets,
  logEntries,
  logLoading,
  logError,
}: GoalProgressProps) {
  const cancel = useGoalStore((state) => state.cancel)
  const retry = useGoalStore((state) => state.retry)
  const selectDocument = useDocumentStore((state) => state.select)
  const activity = useGoalStore((state) => state.activity[goal.id] ?? EMPTY_ACTIVITY)
  const setActiveSection = useUiStore((state) => state.setActiveSection)

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const active = isGoalActive(goal)
  const now = useNow(active)

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])
  const ticketById = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets])

  const counts = ticketCounts(goal, tickets)
  const assignments = readActiveAssignments(goal)
  const ratePause = isRateLimitPause(goal)
  const queued = counts ? Math.max(0, counts.total - counts.done - assignments.length) : null

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  function openSpec(): void {
    if (!goal.specDocumentId) return
    selectDocument(goal.specDocumentId)
    setActiveSection('documents')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 space-y-3 border-b border-line px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-medium text-ink">{goal.title}</h2>
              <Badge tone={goalStatusTone(goal.status)}>{goalStatusLabel(goal.status)}</Badge>
            </div>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
              <span>Start {formatDateTime(goal.createdAt)}</span>
              <span>Dauer {formatDuration(goal, now)}</span>
              {counts && (
                <span>
                  {counts.done} von {counts.total} Tickets erledigt
                </span>
              )}
              {goal.retryCount > 0 && <span>{goal.retryCount}. Wiederholung</span>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {goal.specDocumentId && (
              <Button size="sm" onClick={openSpec}>
                Pflichtenheft
              </Button>
            )}
            {goal.status === 'failed' && (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => void run(() => retry(goal.id))}
              >
                Erneut versuchen
              </Button>
            )}
            {active && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  void confirm({
                    title: 'Vorhaben abbrechen',
                    message: `Vorhaben „${goal.title}" wirklich abbrechen?`,
                    confirmLabel: 'Abbrechen',
                    cancelLabel: 'Weiterlaufen lassen',
                    danger: true,
                  }).then((confirmed) => {
                    if (confirmed) void run(() => cancel(goal.id))
                  })
                }}
              >
                Abbrechen
              </Button>
            )}
          </div>
        </div>

        <PhaseBar goal={goal} />

        {actionError && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {actionError}
          </p>
        )}

        {ratePause ? (
          <p className="rounded-md border border-info/30 bg-info/10 px-2 py-1.5 text-xs text-info">
            Pause wegen Rate-Limit, wird automatisch fortgesetzt.
          </p>
        ) : (
          goal.errorMessage && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5">
              <p className="text-xs font-medium text-danger">
                {goal.errorType ?? 'Fehler'}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-danger/90">
                {goal.errorMessage}
              </p>
            </div>
          )
        )}

        {goal.description && (
          <p className="line-clamp-3 whitespace-pre-wrap text-xs text-ink-muted">
            {goal.description}
          </p>
        )}
      </header>

      {(assignments.length > 0 || (active && counts !== null)) && (
        <section className="shrink-0 border-b border-line px-4 py-2">
          <p className="mb-1.5 flex flex-wrap gap-x-3 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <span>Aktive Tickets</span>
            {counts && (
              <>
                <span className="normal-case tracking-normal text-ink-muted">
                  {queued} in der Warteschlange
                </span>
                <span className="normal-case tracking-normal text-ink-muted">
                  {counts.done} von {counts.total} erledigt
                </span>
              </>
            )}
          </p>

          {assignments.length === 0 ? (
            <p className="text-xs text-ink-faint">Gerade arbeitet kein Agent an einem Ticket.</p>
          ) : (
            <ul className="space-y-1">
              {assignments.map((assignment) => {
                const ticket = ticketById.get(assignment.ticketId)
                const current = activity[assignment.ticketId]
                const agentId = current?.agentId ?? assignment.agentId
                const agent = agentId ? agentById.get(agentId) : null
                return (
                  <li
                    key={assignment.ticketId}
                    className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 text-xs"
                  >
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: agent?.color }}
                        className="h-2 w-2 rounded-full bg-ink-faint"
                      />
                      <span className="font-medium" style={{ color: agent?.color }}>
                        {agent?.name ?? 'Unbekannter Agent'}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                      {ticket ? `#${ticket.number}` : assignment.ticketId}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {ticket?.title ?? 'Unbekanntes Ticket'}
                    </span>
                    <span className="shrink-0 italic text-ink-muted">
                      {current?.tool ?? 'überlegt …'}
                    </span>
                    <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">
                      {current ? formatElapsed(current.since, now) : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Protokoll
        </p>
        <GoalLog
          entries={logEntries}
          loading={logLoading}
          error={logError}
          agents={agentById}
          tickets={ticketById}
        />
      </div>
      {dialog}
    </div>
  )
}

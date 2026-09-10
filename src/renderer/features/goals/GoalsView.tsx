import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { useAgentStore } from '../../store/agentStore'
import { useGoalStore, useSelectedGoal } from '../../store/goalStore'
import { useTicketStore } from '../../store/ticketStore'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Spinner } from '../../ui'
import { GoalIcon, PlusIcon } from '../../ui/icons'
import { GoalList } from './GoalList'
import { GoalProgress } from './GoalProgress'
import { NewGoalView } from './NewGoalView'
import { isGoalActive, useNow } from './goalHelpers'

export function GoalsView() {
  const t = useT()
  const projectId = useUiStore((state) => state.activeProjectId)

  const goals = useGoalStore((state) => state.goals)
  const logs = useGoalStore((state) => state.logs)
  const selectedId = useGoalStore((state) => state.selectedId)
  const draftTicketIds = useGoalStore((state) => state.draftTicketIds)
  const loading = useGoalStore((state) => state.loading)
  const logLoading = useGoalStore((state) => state.logLoading)
  const storeError = useGoalStore((state) => state.error)
  const logError = useGoalStore((state) => state.logError)
  const loadGoals = useGoalStore((state) => state.load)
  const selectGoal = useGoalStore((state) => state.select)
  const setDraftTickets = useGoalStore((state) => state.setDraftTickets)
  const subscribeGoals = useGoalStore((state) => state.subscribe)

  const selected = useSelectedGoal()

  const agents = useAgentStore((state) => state.agents)
  const loadAgents = useAgentStore((state) => state.load)

  // Tickets liefern Zähler, Nummern und Titel für Fortschritt und Protokoll.
  const tickets = useTicketStore((state) => state.tickets)
  const loadTickets = useTicketStore((state) => state.load)
  const subscribeTickets = useTicketStore((state) => state.subscribe)

  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void loadGoals(projectId)
    void loadAgents(projectId)
    void loadTickets(projectId)
  }, [projectId, loadGoals, loadAgents, loadTickets])

  useEffect(() => subscribeGoals(), [subscribeGoals])
  useEffect(() => subscribeTickets(), [subscribeTickets])

  // Das Ticket-Board schickt seine Auswahl hierher und wechselt in diesen Bereich.
  useEffect(() => {
    if (draftTicketIds.length > 0) setCreating(true)
  }, [draftTicketIds])

  const now = useNow(goals.some(isGoalActive))

  if (!projectId) {
    return (
      <EmptyState
        title={t('goals.noProject.title')}
        description={t('goals.noProject.description')}
        icon={<GoalIcon />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
          <h2 className="text-sm font-medium text-ink">{t('goals.title')}</h2>
          {loading && <Spinner size={12} />}
          <div className="flex-1" />
          <Button
            size="sm"
            variant="primary"
            icon={<PlusIcon width={14} height={14} />}
            onClick={() => setCreating(true)}
          >
            {t('goals.new')}
          </Button>
        </header>

        {storeError && (
          <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {storeError}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {goals.length === 0 && !loading ? (
            <EmptyState
              title={t('goals.empty.title')}
              description={t('goals.empty.description')}
              icon={<GoalIcon />}
            />
          ) : (
            <GoalList
              goals={goals}
              tickets={tickets}
              selectedId={creating ? null : selectedId}
              now={now}
              onSelect={(goalId) => {
                setCreating(false)
                void selectGoal(goalId)
              }}
            />
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {creating ? (
          <NewGoalView
            projectId={projectId}
            agents={agents}
            tickets={tickets}
            draftTicketIds={draftTicketIds}
            onClose={() => {
              setCreating(false)
              setDraftTickets([])
            }}
          />
        ) : selected ? (
          <GoalProgress
            goal={selected}
            agents={agents}
            tickets={tickets}
            logEntries={logs[selected.id] ?? []}
            logLoading={logLoading}
            logError={logError}
          />
        ) : (
          <EmptyState
            title={t('goals.none.title')}
            description={t('goals.none.description')}
            icon={<GoalIcon />}
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('goals.new')}
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}

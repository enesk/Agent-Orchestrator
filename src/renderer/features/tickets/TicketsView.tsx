import { useEffect, useMemo, useState } from 'react'
import { TICKET_CATEGORIES, type TicketCategory, type TicketStatus } from '@shared/constants'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useTicketStore } from '../../store/ticketStore'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Input, Select, Spinner } from '../../ui'
import { PlusIcon, TicketIcon } from '../../ui/icons'
import { CreateTicketModal } from './CreateTicketModal'
import { ImportTicketsModal } from './ImportTicketsModal'
import { TicketBoard } from './TicketBoard'
import { TicketDetailPanel } from './TicketDetailPanel'

const CATEGORY_FILTER_OPTIONS = [
  { value: '', label: 'Alle Kategorien' },
  ...TICKET_CATEGORIES.map((option) => ({ value: option.value, label: option.label })),
]

export function TicketsView() {
  const projectId = useUiStore((state) => state.activeProjectId)

  const tickets = useTicketStore((state) => state.tickets)
  const meta = useTicketStore((state) => state.meta)
  const detail = useTicketStore((state) => state.detail)
  const selectedId = useTicketStore((state) => state.selectedId)
  const loading = useTicketStore((state) => state.loading)
  const detailLoading = useTicketStore((state) => state.detailLoading)
  const storeError = useTicketStore((state) => state.error)
  const loadTickets = useTicketStore((state) => state.load)
  const selectTicket = useTicketStore((state) => state.select)
  const setStatus = useTicketStore((state) => state.setStatus)
  const removeTicket = useTicketStore((state) => state.remove)
  const subscribeTickets = useTicketStore((state) => state.subscribe)

  const agents = useAgentStore((state) => state.agents)
  const loadAgents = useAgentStore((state) => state.load)
  const subscribeAgents = useAgentStore((state) => state.subscribe)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    void loadTickets(projectId)
    void loadAgents(projectId)
    setCheckedIds(new Set())
  }, [projectId, loadTickets, loadAgents])

  useEffect(() => subscribeTickets(), [subscribeTickets])
  useEffect(() => subscribeAgents(), [subscribeAgents])

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (categoryFilter && ticket.category !== categoryFilter) return false
      if (agentFilter === '__none__' && ticket.assignedAgentId) return false
      if (agentFilter && agentFilter !== '__none__' && ticket.assignedAgentId !== agentFilter) {
        return false
      }
      if (!query) return true
      return (
        ticket.title.toLowerCase().includes(query) ||
        String(ticket.number).includes(query.replace('#', ''))
      )
    })
  }, [tickets, search, categoryFilter, agentFilter])

  const checkedList = useMemo(
    () => tickets.filter((ticket) => checkedIds.has(ticket.id)),
    [tickets, checkedIds],
  )

  function toggleChecked(ticketId: string): void {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (next.has(ticketId)) next.delete(ticketId)
      else next.add(ticketId)
      return next
    })
  }

  async function run(action: () => Promise<unknown>): Promise<void> {
    setActionBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setActionBusy(false)
    }
  }

  async function deleteChecked(): Promise<void> {
    if (checkedList.length === 0) return
    const confirmed = window.confirm(
      checkedList.length === 1
        ? 'Dieses Ticket löschen?'
        : `${checkedList.length} Tickets löschen?`,
    )
    if (!confirmed) return
    await run(async () => {
      for (const ticket of checkedList) await removeTicket(ticket.id)
      setCheckedIds(new Set())
    })
  }

  async function startGoal(): Promise<void> {
    if (!projectId || checkedList.length === 0) return
    await run(async () => {
      await window.api.goals.startFromTickets({
        projectId,
        ticketIds: checkedList.map((ticket) => ticket.id),
      })
      setCheckedIds(new Set())
    })
  }

  if (!projectId) {
    return (
      <EmptyState
        title="Kein Projekt ausgewählt"
        description="Wähle links ein Projekt, um dessen Tickets zu sehen."
        icon={<TicketIcon />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <Input
            placeholder="Suche nach Titel oder Nummer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64"
          />
          <Select
            options={CATEGORY_FILTER_OPTIONS}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as TicketCategory | '')}
            className="w-44"
          />
          <Select
            options={[
              { value: '', label: 'Alle Agenten' },
              { value: '__none__', label: 'Nicht zugewiesen' },
              ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
            ]}
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="w-44"
          />
          <div className="flex-1" />
          {loading && <Spinner size={14} />}
          <Button onClick={() => setImportOpen(true)}>Import</Button>
          <Button variant="primary" icon={<PlusIcon width={16} height={16} />} onClick={() => setCreateOpen(true)}>
            Neues Ticket
          </Button>
        </header>

        {(storeError || actionError) && (
          <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        {checkedList.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-raised px-3 py-1.5">
            <span className="text-xs text-ink-muted">{checkedList.length} ausgewählt</span>
            <div className="flex-1" />
            <Button size="sm" disabled={actionBusy} onClick={() => setCheckedIds(new Set())}>
              Auswahl aufheben
            </Button>
            <Button size="sm" variant="primary" disabled={actionBusy} onClick={() => void startGoal()}>
              Vorhaben starten
            </Button>
            <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void deleteChecked()}>
              Löschen
            </Button>
          </div>
        )}

        {!loading && tickets.length === 0 ? (
          <EmptyState
            title="Noch keine Tickets"
            description="Lege ein Ticket an oder importiere eine JSON-Datei."
            icon={<TicketIcon />}
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                Neues Ticket
              </Button>
            }
          />
        ) : (
          <TicketBoard
            tickets={visibleTickets}
            agents={agentById}
            meta={meta}
            selectedId={selectedId}
            checkedIds={checkedIds}
            onSelect={(ticketId) => void selectTicket(ticketId)}
            onToggleChecked={toggleChecked}
            onStatusChange={(ticketId, status: TicketStatus) =>
              void run(() => setStatus(ticketId, status))
            }
          />
        )}
      </div>

      {selectedId && detail && (
        <TicketDetailPanel
          detail={detail}
          tickets={tickets}
          agents={agents}
          onClose={() => void selectTicket(null)}
        />
      )}
      {selectedId && !detail && (
        <aside className="flex w-[380px] shrink-0 items-center justify-center border-l border-line bg-surface">
          {detailLoading ? (
            <Spinner />
          ) : (
            <EmptyState
              title="Ticket nicht verfügbar"
              description={storeError ?? 'Die Details konnten nicht geladen werden.'}
              action={
                <Button size="sm" onClick={() => void selectTicket(null)}>
                  Schließen
                </Button>
              }
            />
          )}
        </aside>
      )}

      <CreateTicketModal
        open={createOpen}
        projectId={projectId}
        agents={agents}
        onClose={() => setCreateOpen(false)}
      />
      <ImportTicketsModal
        open={importOpen}
        projectId={projectId}
        tickets={tickets}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}

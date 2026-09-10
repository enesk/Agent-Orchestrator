import { useEffect, useMemo, useRef, useState } from 'react'
import { TICKET_CATEGORIES, type TicketCategory, type TicketStatus } from '@shared/constants'
import { useT } from '../../i18n'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useGoalStore } from '../../store/goalStore'
import { useTicketStore } from '../../store/ticketStore'
import { useUiStore } from '../../store/uiStore'
import { Button, Checkbox, EmptyState, Input, Select, Spinner, useConfirm } from '../../ui'
import { PlusIcon, TicketIcon } from '../../ui/icons'
import { CreateTicketModal } from './CreateTicketModal'
import { ImportTicketsModal } from './ImportTicketsModal'
import { TicketBoard } from './TicketBoard'
import { TicketDetailPanel } from './TicketDetailPanel'
import { categoryLabelKey } from './ticketHelpers'

export function TicketsView() {
  const t = useT()
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
  const removeManyTickets = useTicketStore((state) => state.removeMany)
  const subscribeTickets = useTicketStore((state) => state.subscribe)

  const agents = useAgentStore((state) => state.agents)
  const loadAgents = useAgentStore((state) => state.load)
  const subscribeAgents = useAgentStore((state) => state.subscribe)

  const setDraftTickets = useGoalStore((state) => state.setDraftTickets)
  const setActiveSection = useUiStore((state) => state.setActiveSection)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  /** Ankerpunkt für die Bereichsauswahl per Umschalt-Klick. */
  const lastClickedId = useRef<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    void loadTickets(projectId)
    void loadAgents(projectId)
    setCheckedIds(new Set())
  }, [projectId, loadTickets, loadAgents])

  useEffect(() => subscribeTickets(), [subscribeTickets])
  useEffect(() => subscribeAgents(), [subscribeAgents])

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  const categoryFilterOptions = useMemo(
    () => [
      { value: '', label: t('tickets.filter.allCategories') },
      ...TICKET_CATEGORIES.map((option) => ({
        value: option.value,
        label: t(categoryLabelKey(option.value)),
      })),
    ],
    [t],
  )

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
    () => visibleTickets.filter((ticket) => checkedIds.has(ticket.id)),
    [visibleTickets, checkedIds],
  )

  const allVisibleChecked = visibleTickets.length > 0 && checkedList.length === visibleTickets.length

  // Was der Nutzer nach einer Filteränderung nicht mehr sieht, darf er auch nicht mehr löschen.
  useEffect(() => {
    const visibleIds = new Set(visibleTickets.map((ticket) => ticket.id))
    setCheckedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visibleTickets])

  // Escape hebt die Auswahl auf — aber nicht, während ein Dialog offen ist, der Escape
  // selbst als „schließen" versteht.
  useEffect(() => {
    if (createOpen || importOpen) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setCheckedIds((current) => (current.size === 0 ? current : new Set()))
      lastClickedId.current = null
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createOpen, importOpen])

  function toggleChecked(ticketId: string, columnIds: string[], shiftKey: boolean): void {
    const anchor = lastClickedId.current
    setCheckedIds((current) => {
      const next = new Set(current)
      const from = anchor === null ? -1 : columnIds.indexOf(anchor)
      const to = columnIds.indexOf(ticketId)

      // Umschalt-Klick wählt den Bereich innerhalb derselben Spalte — nur dort ist eine
      // Reihenfolge sichtbar, über Spalten hinweg wäre „dazwischen" willkürlich.
      if (shiftKey && from !== -1 && to !== -1) {
        const [start, end] = from <= to ? [from, to] : [to, from]
        for (const id of columnIds.slice(start, end + 1)) next.add(id)
        return next
      }

      if (next.has(ticketId)) next.delete(ticketId)
      else next.add(ticketId)
      return next
    })
    lastClickedId.current = ticketId
  }

  function toggleColumn(columnIds: string[], checked: boolean): void {
    setCheckedIds((current) => {
      const next = new Set(current)
      for (const id of columnIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
    lastClickedId.current = null
  }

  function toggleAllVisible(): void {
    setCheckedIds(allVisibleChecked ? new Set() : new Set(visibleTickets.map((t) => t.id)))
    lastClickedId.current = null
  }

  function clearChecked(): void {
    setCheckedIds(new Set())
    lastClickedId.current = null
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
    const ids = checkedList.map((ticket) => ticket.id)
    if (ids.length === 0) return
    const confirmed = await confirm({
      title: t('tickets.delete.title', { count: ids.length }),
      message: t('tickets.delete.message', { count: ids.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    await run(async () => {
      await removeManyTickets(ids)
      clearChecked()
    })
  }

  /** Die Auswahl wandert in den Vorhaben-Bereich, wo sie bestätigt und besetzt wird. */
  function startGoal(): void {
    if (!projectId || checkedList.length === 0) return
    setDraftTickets(checkedList.map((ticket) => ticket.id))
    clearChecked()
    setActiveSection('goals')
  }

  if (!projectId) {
    return (
      <EmptyState
        title={t('tickets.noProject.title')}
        description={t('tickets.noProject.description')}
        icon={<TicketIcon />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <Input
            placeholder={t('tickets.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64"
          />
          <Select
            options={categoryFilterOptions}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as TicketCategory | '')}
            className="w-44"
          />
          <Select
            options={[
              { value: '', label: t('tickets.filter.allAgents') },
              { value: '__none__', label: t('ticket.card.unassigned') },
              ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
            ]}
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="w-44"
          />
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-ink-muted">
            <Checkbox
              checked={allVisibleChecked}
              indeterminate={checkedList.length > 0 && !allVisibleChecked}
              disabled={visibleTickets.length === 0}
              onChange={toggleAllVisible}
            />
            {t('tickets.selectAll')}
            <span className="text-ink-faint">({visibleTickets.length})</span>
          </label>
          <div className="flex-1" />
          {loading && <Spinner size={14} />}
          <Button onClick={() => setImportOpen(true)}>{t('tickets.import')}</Button>
          <Button variant="primary" icon={<PlusIcon width={16} height={16} />} onClick={() => setCreateOpen(true)}>
            {t('tickets.new')}
          </Button>
        </header>

        {(storeError || actionError) && (
          <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        {checkedList.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-raised px-3 py-1.5">
            <span className="text-xs text-ink-muted">
              {t('tickets.selected', { count: checkedList.length })}
            </span>
            <div className="flex-1" />
            <Button size="sm" disabled={actionBusy} onClick={clearChecked}>
              {t('tickets.clearSelection')}
            </Button>
            <Button size="sm" variant="primary" disabled={actionBusy} onClick={startGoal}>
              {t('tickets.startGoal')}
            </Button>
            <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void deleteChecked()}>
              {t('common.delete')}
            </Button>
          </div>
        )}

        {!loading && tickets.length === 0 ? (
          <EmptyState
            title={t('tickets.empty.title')}
            description={t('tickets.empty.description')}
            icon={<TicketIcon />}
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {t('tickets.new')}
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
            onToggleColumn={toggleColumn}
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
              title={t('tickets.detailUnavailable.title')}
              description={storeError ?? t('tickets.detailUnavailable.description')}
              action={
                <Button size="sm" onClick={() => void selectTicket(null)}>
                  {t('common.close')}
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
      {dialog}
    </div>
  )
}

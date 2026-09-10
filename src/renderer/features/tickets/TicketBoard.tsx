import { useState } from 'react'
import type { TicketStatus } from '@shared/constants'
import type { ProjectAgent, Ticket } from '@shared/types'
import { useT } from '../../i18n'
import type { TicketMeta } from '../../store/ticketStore'
import { Checkbox, cn } from '../../ui'
import { TicketCard } from './TicketCard'
import { statusLabelKey } from './ticketHelpers'

const COLUMNS: readonly TicketStatus[] = ['open', 'in_progress', 'done']

export interface TicketBoardProps {
  tickets: Ticket[]
  agents: Map<string, ProjectAgent>
  meta: Record<string, TicketMeta>
  selectedId: string | null
  checkedIds: Set<string>
  onSelect: (ticketId: string) => void
  /** `columnIds` ist die sichtbare Spalte der Karte — der Umschalt-Bereich endet dort. */
  onToggleChecked: (ticketId: string, columnIds: string[], shiftKey: boolean) => void
  onToggleColumn: (columnIds: string[], checked: boolean) => void
  onStatusChange: (ticketId: string, status: TicketStatus) => void
}

export function TicketBoard({
  tickets,
  agents,
  meta,
  selectedId,
  checkedIds,
  onSelect,
  onToggleChecked,
  onToggleColumn,
  onStatusChange,
}: TicketBoardProps) {
  const t = useT()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<TicketStatus | null>(null)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-3">
      {COLUMNS.map((status) => {
        const column = tickets.filter((ticket) => ticket.status === status)
        const columnIds = column.map((ticket) => ticket.id)
        const checkedInColumn = columnIds.filter((id) => checkedIds.has(id)).length
        const allChecked = column.length > 0 && checkedInColumn === column.length
        const statusLabel = t(statusLabelKey(status))

        return (
          <section
            key={status}
            onDragOver={(event) => {
              if (!draggingId) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget(status)
            }}
            onDragLeave={() => setDropTarget((current) => (current === status ? null : current))}
            onDrop={(event) => {
              event.preventDefault()
              setDropTarget(null)
              const ticketId = event.dataTransfer.getData('text/ticket-id') || draggingId
              setDraggingId(null)
              if (!ticketId) return
              const ticket = tickets.find((item) => item.id === ticketId)
              if (!ticket || ticket.status === status) return
              onStatusChange(ticketId, status)
            }}
            className={cn(
              'flex min-h-0 flex-col rounded-lg border bg-surface transition-colors',
              dropTarget === status ? 'border-accent' : 'border-line',
            )}
          >
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
              <Checkbox
                checked={allChecked}
                indeterminate={checkedInColumn > 0 && !allChecked}
                disabled={column.length === 0}
                aria-label={t('ticket.board.selectColumn', { status: statusLabel })}
                title={t('ticket.board.selectColumnTitle')}
                onChange={(event) => onToggleColumn(columnIds, event.target.checked)}
              />
              <h3 className="text-sm font-medium text-ink">{statusLabel}</h3>
              <div className="flex-1" />
              <span className="text-xs text-ink-faint">{column.length}</span>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
              {column.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-ink-faint">
                  {t('ticket.board.emptyColumn')}
                </p>
              )}
              {column.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  agent={ticket.assignedAgentId ? agents.get(ticket.assignedAgentId) ?? null : null}
                  meta={meta[ticket.id]}
                  selected={ticket.id === selectedId}
                  checked={checkedIds.has(ticket.id)}
                  showCheckbox={checkedIds.size > 0}
                  dragging={draggingId === ticket.id}
                  onSelect={() => onSelect(ticket.id)}
                  onToggleChecked={(event) =>
                    onToggleChecked(ticket.id, columnIds, event.shiftKey)
                  }
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/ticket-id', ticket.id)
                    event.dataTransfer.effectAllowed = 'move'
                    setDraggingId(ticket.id)
                  }}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setDropTarget(null)
                  }}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

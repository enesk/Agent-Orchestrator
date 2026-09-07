import { useState } from 'react'
import { TICKET_STATUS_LABELS, type TicketStatus } from '@shared/constants'
import type { ProjectAgent, Ticket } from '@shared/types'
import type { TicketMeta } from '../../store/ticketStore'
import { cn } from '../../ui'
import { TicketCard } from './TicketCard'

const COLUMNS: readonly TicketStatus[] = ['open', 'in_progress', 'done']

export interface TicketBoardProps {
  tickets: Ticket[]
  agents: Map<string, ProjectAgent>
  meta: Record<string, TicketMeta>
  selectedId: string | null
  checkedIds: Set<string>
  onSelect: (ticketId: string) => void
  onToggleChecked: (ticketId: string) => void
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
  onStatusChange,
}: TicketBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<TicketStatus | null>(null)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-3">
      {COLUMNS.map((status) => {
        const column = tickets.filter((ticket) => ticket.status === status)
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
            <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
              <h3 className="text-sm font-medium text-ink">{TICKET_STATUS_LABELS[status]}</h3>
              <span className="text-xs text-ink-faint">{column.length}</span>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
              {column.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-ink-faint">Keine Tickets</p>
              )}
              {column.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  agent={ticket.assignedAgentId ? agents.get(ticket.assignedAgentId) ?? null : null}
                  meta={meta[ticket.id]}
                  selected={ticket.id === selectedId}
                  checked={checkedIds.has(ticket.id)}
                  dragging={draggingId === ticket.id}
                  onSelect={() => onSelect(ticket.id)}
                  onToggleChecked={() => onToggleChecked(ticket.id)}
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

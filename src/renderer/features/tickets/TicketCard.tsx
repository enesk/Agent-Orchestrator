import type { DragEvent } from 'react'
import type { ProjectAgent, Ticket } from '@shared/types'
import type { TicketMeta } from '../../store/ticketStore'
import { Badge, cn } from '../../ui'
import { categoryOption } from './ticketHelpers'

export interface TicketCardProps {
  ticket: Ticket
  agent: ProjectAgent | null
  meta: TicketMeta | undefined
  selected: boolean
  checked: boolean
  onSelect: () => void
  onToggleChecked: () => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  dragging: boolean
}

export function TicketCard({
  ticket,
  agent,
  meta,
  selected,
  checked,
  onSelect,
  onToggleChecked,
  onDragStart,
  onDragEnd,
  dragging,
}: TicketCardProps) {
  const category = categoryOption(ticket.category)

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-md border bg-surface p-2.5 transition-colors',
        selected ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          aria-label={`Ticket #${ticket.number} auswählen`}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggleChecked}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
        />
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">#{ticket.number}</span>
        <h4 className="min-w-0 flex-1 text-xs font-medium leading-snug text-ink">{ticket.title}</h4>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[22px]">
        <Badge color={category.color}>{category.label}</Badge>

        {agent ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: agent.color }}
              aria-hidden="true"
            />
            {agent.name}
          </span>
        ) : (
          <span className="text-[11px] text-ink-faint">Nicht zugewiesen</span>
        )}

        {meta && meta.comments > 0 && (
          <span className="text-[11px] text-ink-faint" title="Kommentare">
            {meta.comments} Kommentare
          </span>
        )}

        {meta && meta.dependencies > 0 && (
          <span className="text-[11px] text-warning" title="Abhängigkeiten">
            {meta.dependencies} abhängig
          </span>
        )}
      </div>
    </article>
  )
}

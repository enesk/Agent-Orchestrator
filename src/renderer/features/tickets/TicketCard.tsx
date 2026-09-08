import type { DragEvent, MouseEvent } from 'react'
import type { ProjectAgent, Ticket } from '@shared/types'
import type { TicketMeta } from '../../store/ticketStore'
import { Badge, Checkbox, cn } from '../../ui'
import { categoryOption } from './ticketHelpers'

export interface TicketCardProps {
  ticket: Ticket
  agent: ProjectAgent | null
  meta: TicketMeta | undefined
  selected: boolean
  checked: boolean
  /** Solange nichts ausgewählt ist, bleibt das Kästchen bis zum Überfahren unsichtbar. */
  showCheckbox: boolean
  onSelect: () => void
  onToggleChecked: (event: MouseEvent<HTMLInputElement>) => void
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
  showCheckbox,
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
        'group cursor-pointer rounded-md border bg-surface p-2.5 transition-colors',
        checked
          ? 'border-accent bg-accent-soft/60'
          : selected
            ? 'border-accent bg-accent-soft/40'
            : 'border-line hover:border-line-strong',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={checked}
          aria-label={`Ticket #${ticket.number} auswählen`}
          // Die Auswahl läuft über `onClick`, weil nur dort die Umschalttaste zu sehen ist.
          onClick={(event) => {
            event.stopPropagation()
            onToggleChecked(event)
          }}
          onChange={() => undefined}
          className={cn(
            'mt-0.5 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
            showCheckbox ? 'opacity-100' : 'opacity-0',
          )}
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

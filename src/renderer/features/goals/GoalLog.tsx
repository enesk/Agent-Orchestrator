import { useEffect, useRef, useState } from 'react'
import type { GoalLogEntry, ProjectAgent, Ticket } from '@shared/types'
import { Button, Spinner, cn } from '../../ui'
import { formatTime } from './goalHelpers'

/** Ab diesem Abstand zum unteren Rand gilt die Ansicht als „unten angeheftet". */
const STICK_THRESHOLD = 48

export interface GoalLogProps {
  entries: GoalLogEntry[]
  loading: boolean
  error: string | null
  agents: Map<string, ProjectAgent>
  tickets: Map<string, Ticket>
}

export function GoalLog({ entries, loading, error, agents, tickets }: GoalLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !pinned) return
    element.scrollTop = element.scrollHeight
  }, [entries, pinned])

  function onScroll(): void {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setPinned(distance <= STICK_THRESHOLD)
  }

  function scrollToEnd(): void {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    setPinned(true)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <p className="m-3 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        ) : loading && entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <p className="p-3 text-xs text-ink-faint">Noch keine Meldungen.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {entries.map((entry) => (
              <LogRow
                key={entry.id}
                entry={entry}
                agentName={entry.agentId ? (agents.get(entry.agentId)?.name ?? null) : null}
                ticketNumber={entry.ticketId ? (tickets.get(entry.ticketId)?.number ?? null) : null}
              />
            ))}
          </ul>
        )}
      </div>

      {!pinned && entries.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <Button size="sm" className="pointer-events-auto shadow-lg" onClick={scrollToEnd}>
            Neueste anzeigen
          </Button>
        </div>
      )}
    </div>
  )
}

interface LogRowProps {
  entry: GoalLogEntry
  agentName: string | null
  ticketNumber: number | null
}

function LogRow({ entry, agentName, ticketNumber }: LogRowProps) {
  return (
    <li className="flex items-start gap-2 px-3 py-1.5">
      <StatusMark status={entry.status} />
      <span className="shrink-0 pt-px font-mono text-[11px] text-ink-faint">
        {formatTime(entry.createdAt)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words text-xs text-ink">{entry.message}</p>
        {(entry.phase || agentName || ticketNumber !== null) && (
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
            {entry.phase && <span>{entry.phase}</span>}
            {agentName && <span>{agentName}</span>}
            {ticketNumber !== null && <span>#{ticketNumber}</span>}
          </p>
        )}
      </div>
    </li>
  )
}

function StatusMark({ status }: { status: GoalLogEntry['status'] }) {
  const label =
    status === 'running' ? 'Läuft' : status === 'success' ? 'Erfolgreich' : 'Fehlgeschlagen'
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
        status === 'running' && 'animate-pulse bg-accent',
        status === 'success' && 'bg-success',
        status === 'failed' && 'bg-danger',
      )}
    />
  )
}

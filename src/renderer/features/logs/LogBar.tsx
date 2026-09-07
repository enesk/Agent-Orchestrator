import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry, LogLevel } from '@shared/types'
import { useUiStore } from '../../store/uiStore'
import { Button, IconButton, Input, Select, cn } from '../../ui'
import { CloseIcon } from '../../ui/icons'
import type { SelectOption } from '../../ui'

const LEVEL_SHORT: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'FEHLER',
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-ink-faint',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-danger',
}

/** Ab dieser Anzahl fällt vorne etwas raus — die Leiste ist eine Live-Ansicht, kein Archiv. */
const MAX_VISIBLE = 500

const LEVEL_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'Alle Level' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnung' },
  { value: 'error', label: 'Fehler' },
]

export function LogBar() {
  const close = useUiStore((state) => state.setLogBarOpen)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [level, setLevel] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [pinned, setPinned] = useState(true)

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true

    window.api.logs
      .recent({ limit: MAX_VISIBLE })
      .then((recent) => {
        if (active) setEntries(recent)
      })
      .catch(() => {
        if (active) setEntries([])
      })

    const off = window.api.on('log.entry', (entry) => {
      setEntries((current) => {
        const next = [...current, entry]
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
      })
    })

    return () => {
      active = false
      off()
    }
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false
      if (!needle) return true
      return (
        entry.message.toLowerCase().includes(needle) || entry.scope.toLowerCase().includes(needle)
      )
    })
  }, [entries, level, query])

  useLayoutEffect(() => {
    if (!pinned) return
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [visible, pinned])

  const handleScroll = (): void => {
    const list = listRef.current
    if (!list) return
    // Ein paar Pixel Toleranz, sonst löst schon das Abrunden der Scrollhöhe die Pause aus.
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24
    setPinned(atBottom)
  }

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-line bg-surface">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-xs font-medium text-ink">Protokoll</span>
        <span className="text-xs text-ink-faint">
          {visible.length === entries.length
            ? `${entries.length} Einträge`
            : `${visible.length} von ${entries.length}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {!pinned && (
            <Button variant="ghost" onClick={() => setPinned(true)}>
              Ans Ende springen
            </Button>
          )}
          <Input
            className="w-52"
            placeholder="Suchen …"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            className="w-36"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          />
          <Button onClick={() => setEntries([])}>Leeren</Button>
          <IconButton
            label="Protokoll schließen"
            icon={<CloseIcon width={16} height={16} />}
            onClick={() => close(false)}
          />
        </div>
      </header>

      <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">Keine passenden Einträge.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
            {visible.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-ink-faint">{formatTime(entry.timestamp)}</span>
                <span className={cn('w-12 shrink-0', LEVEL_COLORS[entry.level])}>
                  {LEVEL_SHORT[entry.level]}
                </span>
                <span className="shrink-0 text-ink-muted">{entry.scope}</span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-ink">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('de-DE', { hour12: false })
}

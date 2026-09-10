import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TranslationKey } from '@shared/i18n'
import type { LogEntry, LogLevel } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { useUiStore } from '../../store/uiStore'
import { Button, IconButton, Input, Select, cn } from '../../ui'
import { CloseIcon } from '../../ui/icons'
import type { SelectOption } from '../../ui'

const LEVEL_SHORT_KEYS: Record<LogLevel, TranslationKey> = {
  debug: 'log.levelShort.debug',
  info: 'log.levelShort.info',
  warn: 'log.levelShort.warn',
  error: 'log.levelShort.error',
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-ink-faint',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-danger',
}

/** Ab dieser Anzahl fällt vorne etwas raus — die Leiste ist eine Live-Ansicht, kein Archiv. */
const MAX_VISIBLE = 500

const LEVEL_OPTION_KEYS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'all', labelKey: 'log.level.all' },
  { value: 'debug', labelKey: 'log.level.debug' },
  { value: 'info', labelKey: 'log.level.info' },
  { value: 'warn', labelKey: 'log.level.warn' },
  { value: 'error', labelKey: 'log.level.error' },
]

export function LogBar() {
  const t = useT()
  const format = useFormat()
  const levelOptions = useMemo<SelectOption[]>(
    () => LEVEL_OPTION_KEYS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
    [t],
  )
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
        <span className="text-xs font-medium text-ink">{t('log.title')}</span>
        <span className="text-xs text-ink-faint">
          {visible.length === entries.length
            ? t('log.entries', { count: entries.length })
            : t('log.filtered', { visible: visible.length, total: entries.length })}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {!pinned && (
            <Button variant="ghost" onClick={() => setPinned(true)}>
              {t('log.toEnd')}
            </Button>
          )}
          <Input
            className="w-52"
            placeholder={t('log.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            className="w-36"
            options={levelOptions}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          />
          <Button onClick={() => setEntries([])}>{t('log.clear')}</Button>
          <IconButton
            label={t('log.close')}
            icon={<CloseIcon width={16} height={16} />}
            onClick={() => close(false)}
          />
        </div>
      </header>

      <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">{t('log.noEntries')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
            {visible.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-ink-faint">{format.timeWithSeconds(entry.timestamp)}</span>
                <span className={cn('w-12 shrink-0', LEVEL_COLORS[entry.level])}>
                  {t(LEVEL_SHORT_KEYS[entry.level])}
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

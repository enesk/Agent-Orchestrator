import React, { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogEntry } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  logs: LogEntry[]
  onClear: () => void
}

const levelBadge: Record<LogEntry['level'], { bg: string; text: string }> = {
  info:  { bg: 'bg-status-info-bg', text: 'text-status-info' },
  warn:  { bg: 'bg-status-warning-bg', text: 'text-status-warning' },
  error: { bg: 'bg-status-error-bg', text: 'text-status-error' },
  debug: { bg: 'bg-surface-light', text: 'text-txt-muted' },
}

export default function LogFeed({ logs, onClear }: Props) {
  const { t, lang } = useLanguage()
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const isUserScrolled = useRef(false)

  const timeLocale = lang === 'de' ? 'de-DE' : lang === 'tr' ? 'tr-TR' : 'en-GB'

  useEffect(() => {
    if (!isUserScrolled.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs.length])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    isUserScrolled.current = !atBottom
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-txt-secondary uppercase tracking-wider">
          {t('logs.title')}
        </h2>
        {logs.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-txt-secondary hover:text-txt-primary transition-colors px-2 py-1 rounded hover:bg-surface-light"
          >
            {t('logs.clear')}
          </button>
        )}
      </div>

      {/* Log container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto rounded-xl bg-white border border-border p-3 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-txt-secondary/50 text-sm">
            {t('logs.empty')}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((entry) => {
              const badge = levelBadge[entry.level]
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-2 py-1 px-1 rounded hover:bg-surface-hover/50 group"
                >
                  <span className="text-txt-secondary/50 shrink-0 tabular-nums">
                    {new Date(entry.timestamp).toLocaleTimeString(timeLocale)}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wide ${badge.bg} ${badge.text}`}>
                    {entry.level}
                  </span>
                  <span className="text-txt-primary/80 break-all leading-relaxed">
                    {entry.message}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}

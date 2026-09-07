import React, { useState, useRef, useEffect, useMemo, useCallback, PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ChatMessage, ProjectAgent } from '@shared/types'
import { AgentMessageRow, MessageContent } from './ChatWindow'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  parentMessage: ChatMessage
  replies: ChatMessage[]
  agents: ProjectAgent[]
  onClose: () => void
  onDeleteMessage: (id: string) => void
  onRetryMessage: (id: string) => void
  onSendMessage: (content: string, replyToLocalId?: string) => void
}

const MIN_WIDTH = 360
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 400
const THREAD_STORAGE_KEY = 'orchestrator-thread-panel-width'

function getStoredThreadWidth(): number {
  try {
    const v = localStorage.getItem(THREAD_STORAGE_KEY)
    if (v) {
      const n = parseInt(v, 10)
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n
    }
  } catch {}
  return DEFAULT_WIDTH
}

export default function ThreadPanel({ parentMessage, replies, agents, onClose, onDeleteMessage, onRetryMessage, onSendMessage }: Props) {
  const { t, lang } = useLanguage()
  const [width, setWidth] = useState(getStoredThreadWidth)
  const [isResizing, setIsResizing] = useState(false)
  const [input, setInput] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [selectedAutocomplete, setSelectedAutocomplete] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredAgents = useMemo(() => {
    if (!autocompleteFilter) return agents
    return agents.filter((a) =>
      a.name.toLowerCase().includes(autocompleteFilter.toLowerCase()) ||
      a.mentionKey.toLowerCase().includes(autocompleteFilter.toLowerCase())
    )
  }, [agents, autocompleteFilter])


  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/)

    if (atMatch) {
      setShowAutocomplete(true)
      setAutocompleteFilter(atMatch[1])
      setSelectedAutocomplete(0)
    } else {
      setShowAutocomplete(false)
    }
  }

  const insertMention = useCallback((agent: ProjectAgent) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const textBeforeCursor = input.substring(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/)

    if (atMatch) {
      const beforeAt = textBeforeCursor.substring(0, atMatch.index)
      const afterCursor = input.substring(cursorPos)
      setInput(`${beforeAt}${agent.mentionKey} ${afterCursor}`)
    }

    setShowAutocomplete(false)
    textarea.focus()
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedAutocomplete((p) => Math.min(p + 1, filteredAgents.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedAutocomplete((p) => Math.max(p - 1, 0)); return }
      if ((e.key === 'Enter' || e.key === 'Tab') && filteredAgents.length > 0) { e.preventDefault(); insertMention(filteredAgents[selectedAutocomplete]); return }
      if (e.key === 'Escape') { setShowAutocomplete(false); return }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Find agents that participated in this thread for auto-mention
  const threadAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of replies) {
      if (r.agentLocalId) ids.add(r.agentLocalId)
    }
    return ids
  }, [replies])

  const handleSend = () => {
    let trimmed = input.trim()
    if (!trimmed) return

    // Auto-mention: if user didn't manually mention any agent, prepend the thread agents
    const hasMention = agents.some((a) => trimmed.toLowerCase().includes(a.mentionKey.toLowerCase()))
    if (!hasMention && threadAgentIds.size > 0) {
      const mentions = agents
        .filter((a) => threadAgentIds.has(a.id))
        .map((a) => a.mentionKey)
        .join(' ')
      trimmed = `${mentions} ${trimmed}`
    }

    onSendMessage(trimmed, parentMessage.id)
    setInput('')
    setShowAutocomplete(false)
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px'
    }
  }, [input])

  const timeLocale = lang === 'de' ? 'de-DE' : lang === 'tr' ? 'tr-TR' : 'en-GB'
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  const handleResizeStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = width

    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = startX - ev.clientX
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)))
    }

    const onUp = (ev: globalThis.PointerEvent) => {
      const finalWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)))
      setIsResizing(false)
      try { localStorage.setItem(THREAD_STORAGE_KEY, String(finalWidth)) } catch {}
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [width])

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
      className="relative flex flex-col h-full border-l border-border bg-white overflow-hidden flex-shrink-0"
    >
      {/* Resize handle */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-accent/30 active:bg-accent/50 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-border flex-shrink-0">
        <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">{t('thread.title')}</span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Parent message — card style */}
        <div className="px-5 py-4">
          <div className="bg-surface-light rounded-xl p-4">
            <div className="flex gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-bold text-accent">{t('common.you')}</span>
                  <span className="text-[11px] text-txt-muted">{formatTime(parentMessage.clientTimestamp)}</span>
                </div>
                <div className="text-base text-txt-primary leading-relaxed">
                  <MessageContent content={parentMessage.content} agents={agents} />
                </div>
              </div>
            </div>
          </div>

          {/* Divider + reply count */}
          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-txt-muted font-medium">
              {replies.length} {replies.length === 1 ? t('chat.reply') : t('chat.replies')}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>

        {/* Replies — compact chat bubbles */}
        <div className="py-1">
          {replies.map((reply, idx) => {
            const prevReply = idx > 0 ? replies[idx - 1] : null
            const compact = prevReply?.agentLocalId === reply.agentLocalId
            return (
              <AgentMessageRow
                key={reply.id}
                msg={reply}
                agents={agents}
                formatTime={formatTime}
                onDelete={onDeleteMessage}
                onRetry={onRetryMessage}
                compact={compact}
                onReply={(agent) => {
                  setInput((prev) => prev.includes(agent.mentionKey) ? prev : (prev.trim() ? prev.trimEnd() + ' ' : '') + agent.mentionKey + ' ')
                  textareaRef.current?.focus()
                }}
              />
            )
          })}

          {/* Typing indicators */}
          {agents
            .filter((a) => (a.status === 'thinking' || a.status === 'responding') && !replies.some((r) => r.agentLocalId === a.id && r.status === 'streaming'))
            .map((agent) => (
              <div key={`typing-${agent.id}`} className="flex items-center gap-2 px-5 py-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0"
                  style={{ backgroundColor: agent.color + '18', color: agent.color }}
                >
                  {agent.avatar || agent.name.charAt(0)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: agent.color }}>{agent.name}</span>
                  <span className="text-[11px] text-txt-muted">{agent.status === 'thinking' ? t('chat.thinking') : t('chat.typing')}</span>
                  <div className="flex gap-0.5 items-center">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: agent.color, animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input — same style as ChatWindow */}
      <div className="bg-white border-t border-border px-4 pb-4 pt-3 relative">
        {/* Autocomplete */}
        <AnimatePresence>
          {showAutocomplete && filteredAgents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-full left-4 right-4 mb-1 rounded-xl bg-white border border-border shadow-lg overflow-hidden"
            >
              {filteredAgents.map((agent, i) => (
                <button
                  key={agent.id}
                  onClick={() => insertMention(agent)}
                  className={`flex items-center gap-2.5 w-full px-3 h-11 text-left transition-colors ${
                    i === selectedAutocomplete ? 'bg-accent-light' : 'hover:bg-surface-hover'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-medium"
                    style={{ backgroundColor: agent.color + '18', color: agent.color }}
                  >
                    {agent.avatar || agent.name.charAt(0)}
                  </div>
                  <span className="text-sm text-txt-primary font-medium">{agent.name}</span>
                  <span className="text-xs text-txt-muted font-mono">{agent.mentionKey}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('thread.inputPlaceholder')}
            rows={1}
            className="w-full resize-none rounded-xl pl-4 pr-14 py-3 text-sm text-txt-primary placeholder:text-txt-muted bg-surface-light border border-border focus:border-accent focus:ring-0 transition-colors outline-none"
            style={{ maxHeight: '100px', minHeight: '44px' }}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!input.trim()}
            className="absolute right-1.5 bottom-1.5 h-9 w-9 rounded-[10px] bg-accent text-white flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:bg-accent-dark"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

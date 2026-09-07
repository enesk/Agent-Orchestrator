import React, { useState, useCallback, PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ProjectAgent, Ticket, TicketComment, TicketCategory, MessageAttachment } from '@shared/types'
import { TICKET_CATEGORIES } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import RichTextEditor, { RichTextViewer, htmlToPlainText, looksLikeHtml } from './RichTextEditor'
import { useIpc } from '../hooks/useIpc'

const TICKET_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const TICKET_IMAGE_MAX_BYTES = 10 * 1024 * 1024

function attachmentUrl(localPath: string): string {
  const normalized = localPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/attachments/')
  const rel = idx >= 0 ? normalized.slice(idx + '/attachments/'.length) : normalized
  return 'attachment://' + rel.split('/').map(encodeURIComponent).join('/')
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      resolve(r.includes(',') ? r.split(',')[1] : r)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const CONTEXT_MIN_WIDTH = 300
const CONTEXT_MAX_WIDTH = 700
const CONTEXT_DEFAULT_WIDTH = 360
const STORAGE_KEY = 'orchestrator-context-panel-width'

function getStoredWidth(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) {
      const n = parseInt(v, 10)
      if (n >= CONTEXT_MIN_WIDTH && n <= CONTEXT_MAX_WIDTH) return n
    }
  } catch {}
  return CONTEXT_DEFAULT_WIDTH
}

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  bug: 'category.bug',
  feature: 'category.feature',
  task: 'category.task',
  improvement: 'category.improvement',
  documentation: 'category.documentation',
  question: 'category.question',
  epic: 'category.epic',
}

type Tab = 'agents' | 'ticket-detail'

interface Props {
  agents: ProjectAgent[]
  onAddAgent: () => void
  onEditAgent: (agent: ProjectAgent) => void
  onRemoveAgent: (agentId: string) => void
  /** Per-agent kill switch — stops that one agent immediately, or lets it work again. */
  onSetAgentStopped: (agentId: string, stopped: boolean) => void | Promise<void>
  selectedTicket: Ticket | null
  onCloseTicket: () => void
  onUpdateTicket: (ticketId: string, updates: Partial<Ticket>) => Promise<Ticket | undefined>
  onDeleteTicket: (ticketId: string) => Promise<void>
  onAddComment: (ticketId: string, content: string) => Promise<TicketComment | undefined>
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  idle: { bg: '#F4F5F7', text: '#6B7280' },
  thinking: { bg: '#FEF3C7', text: '#B45309' },
  responding: { bg: '#EEF2FF', text: '#4F46E5' },
  stopped: { bg: '#FEE2E2', text: '#B91C1C' },
}

function AgentStatusBadge({ agent }: { agent: ProjectAgent }) {
  const { t } = useLanguage()
  if (agent.stopped) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{ backgroundColor: STATUS_BADGE.stopped.bg, color: STATUS_BADGE.stopped.text }}
      >
        {t('context.stoppedStatus')}
      </span>
    )
  }
  const style = STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle
  const label = agent.status === 'idle' ? t('context.idle') : agent.status === 'thinking' ? t('context.thinkingStatus') : t('context.typingStatus')

  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {label}
    </span>
  )
}

export default function ContextPanel({ agents, onAddAgent, onEditAgent, onRemoveAgent, onSetAgentStopped, selectedTicket, onCloseTicket, onUpdateTicket, onDeleteTicket, onAddComment }: Props) {
  const { t } = useLanguage()
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)
  const [width, setWidth] = useState(getStoredWidth)
  const [isResizing, setIsResizing] = useState(false)

  const activeTab: Tab = selectedTicket ? 'ticket-detail' : 'agents'

  const handleResizeStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = width

    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = startX - ev.clientX
      const newWidth = Math.min(CONTEXT_MAX_WIDTH, Math.max(CONTEXT_MIN_WIDTH, startWidth + delta))
      setWidth(newWidth)
    }

    const onUp = () => {
      setIsResizing(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      // Persist on release
      try { localStorage.setItem(STORAGE_KEY, String(Math.min(CONTEXT_MAX_WIDTH, Math.max(CONTEXT_MIN_WIDTH, startWidth + (startX - startX))))) } catch {}
    }

    // Use a closure to capture final width on up
    const onUpFinal = (ev: globalThis.PointerEvent) => {
      const finalWidth = Math.min(CONTEXT_MAX_WIDTH, Math.max(CONTEXT_MIN_WIDTH, startWidth + (startX - ev.clientX)))
      setIsResizing(false)
      try { localStorage.setItem(STORAGE_KEY, String(finalWidth)) } catch {}
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUpFinal)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUpFinal)
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
      {/* Tab header — segmented control style */}
      <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
        {activeTab === 'agents' ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-surface-dark rounded-[10px] p-0.5">
              <span className="px-3 py-1.5 rounded-lg bg-surface-light text-txt-primary text-xs font-semibold">
                {t('context.agents')}
              </span>
            </div>
            <button
              onClick={onAddAgent}
              className="w-7 h-7 rounded-md flex items-center justify-center text-txt-muted hover:text-accent hover:bg-accent-light transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
              {t('context.ticket')} #{selectedTicket?.ticketNumber}
            </span>
            <button
              onClick={onCloseTicket}
              className="w-7 h-7 rounded-md flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'agents' ? (
            <motion.div
              key="agents"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-2"
            >
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors group ${
                    agent.stopped
                      ? 'border-status-error/40 bg-status-error/5'
                      : 'border-border bg-[#F8FAFC] hover:border-border-light'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-medium"
                    style={{ backgroundColor: agent.color + '18', color: agent.color }}
                  >
                    {agent.avatar || agent.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
                      <span className="text-[15px] font-semibold text-txt-primary truncate">{agent.name}</span>
                    </div>
                    {agent.title && (
                      <p className="text-xs text-txt-secondary mt-0.5 truncate">{agent.title}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <AgentStatusBadge agent={agent} />
                      <span className="text-[11px] text-txt-muted font-mono">{agent.mentionKey}</span>
                    </div>
                    {agent.currentTool && (
                      <span className="inline-block mt-1.5 text-[13px] font-mono px-1.5 py-0.5 rounded bg-surface-light text-txt-body">
                        {agent.currentTool}
                      </span>
                    )}
                  </div>

                  {/* Stop / Resume — always visible, this is a kill switch and must be reachable
                      without hovering the right row. */}
                  <div className="flex-shrink-0 mt-0.5">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onSetAgentStopped(agent.id, !agent.stopped)}
                      title={agent.stopped ? t('context.resumeAgentTitle') : t('context.stopAgentTitle')}
                      aria-label={agent.stopped ? t('context.resumeAgentTitle') : t('context.stopAgentTitle')}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        agent.stopped
                          ? 'border-status-success/40 text-status-success hover:bg-status-success/10'
                          : 'border-status-error/40 text-status-error hover:bg-status-error/10'
                      }`}
                    >
                      {agent.stopped ? (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                          <path d="M2 1.2v7.6L8.5 5 2 1.2z" />
                        </svg>
                      ) : (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                          <rect x="1.5" y="1.5" width="7" height="7" rx="1.2" />
                        </svg>
                      )}
                      {agent.stopped ? t('context.resumeAgent') : t('context.stopAgent')}
                    </motion.button>
                  </div>

                  {/* Edit + Remove */}
                  {hoveredAgent === agent.id && (
                    <div className="flex items-center gap-0.5 flex-shrink-0 mt-1">
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        whileHover={{ opacity: 1 }}
                        onClick={() => onEditAgent(agent)}
                        className="p-1.5 rounded-md hover:bg-accent/15 text-txt-muted hover:text-accent transition-colors"
                        title={t('agentCreate.editTitle')}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </motion.button>
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        whileHover={{ opacity: 1 }}
                        onClick={() => onRemoveAgent(agent.id)}
                        className="p-1.5 rounded-md hover:bg-status-error/15 text-txt-muted hover:text-status-error transition-colors"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </motion.button>
                    </div>
                  )}
                </div>
              ))}

              {agents.length === 0 && (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-xl bg-surface-light flex items-center justify-center mx-auto mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-txt-muted">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-xs text-txt-muted mb-2">{t('context.noAgents')}</p>
                  <button
                    onClick={onAddAgent}
                    className="text-xs text-accent hover:text-accent-dark transition-colors"
                  >
                    {t('context.addAgent')}
                  </button>
                </div>
              )}
            </motion.div>
          ) : selectedTicket ? (
            <motion.div
              key="ticket"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-5"
            >
              <InlineTicketDetail
                ticket={selectedTicket}
                agents={agents}
                onUpdate={onUpdateTicket}
                onDelete={async (id) => { await onDeleteTicket(id); onCloseTicket() }}
                onAddComment={onAddComment}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// Inline ticket detail for context panel
function InlineTicketDetail({ ticket, agents, onUpdate, onDelete, onAddComment }: {
  ticket: Ticket
  agents: ProjectAgent[]
  onUpdate: (id: string, u: Partial<Ticket>) => Promise<Ticket | undefined>
  onDelete: (id: string) => Promise<void>
  onAddComment: (id: string, content: string) => Promise<TicketComment | undefined>
}) {
  const { t, lang } = useLanguage()
  const ipc = useIpc()
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description ?? '')
  const [status, setStatus] = useState(ticket.status)
  const [category, setCategory] = useState<TicketCategory | ''>(ticket.category ?? '')
  const [assignedAgentId, setAssignedAgentId] = useState(ticket.assignedAgentLocalId ?? '')
  const [commentInput, setCommentInput] = useState('')
  const [localComments, setLocalComments] = useState(ticket.comments)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [descMode, setDescMode] = useState<'edit' | 'preview'>(htmlToPlainText(ticket.description ?? '') ? 'preview' : 'edit')
  const [attachments, setAttachments] = useState<MessageAttachment[]>(ticket.attachments ?? [])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const ticketFileInputRef = React.useRef<HTMLInputElement>(null)

  const timeLocale = lang === 'de' ? 'de-DE' : lang === 'tr' ? 'tr-TR' : 'en-GB'

  // Sync on prop change
  React.useEffect(() => {
    setTitle(ticket.title)
    setDescription(ticket.description ?? '')
    setStatus(ticket.status)
    setCategory(ticket.category ?? '')
    setAssignedAgentId(ticket.assignedAgentLocalId ?? '')
    setLocalComments(ticket.comments)
    setAttachments(ticket.attachments ?? [])
  }, [ticket])

  const uploadAttachments = async (files: File[]) => {
    setAttachmentError(null)
    const candidates = files.filter((f) => TICKET_IMAGE_MIME.includes(f.type.toLowerCase()))
    if (candidates.length === 0) {
      setAttachmentError('Nur Bilder (PNG, JPG, WebP, GIF) werden unterstützt')
      return
    }
    const tooLarge = candidates.find((f) => f.size > TICKET_IMAGE_MAX_BYTES)
    if (tooLarge) {
      setAttachmentError(`Datei zu groß (max. 10 MB): ${tooLarge.name}`)
      return
    }
    setIsUploading(true)
    const saved: MessageAttachment[] = []
    try {
      for (const f of candidates) {
        const base64 = await fileToBase64(f)
        const res = await ipc.saveAttachment(ticket.id, f.name, f.type, base64)
        if (res.success && res.attachment) {
          saved.push(res.attachment)
        } else {
          setAttachmentError(res.error || 'Upload fehlgeschlagen')
          break
        }
      }
    } catch (err) {
      setAttachmentError((err as Error).message)
    }
    setIsUploading(false)
    if (saved.length === 0) return
    const next = [...attachments, ...saved]
    setAttachments(next)
    await onUpdate(ticket.id, { attachments: next })
  }

  const removeAttachment = async (id: string) => {
    const next = attachments.filter((a) => a.id !== id)
    setAttachments(next)
    await onUpdate(ticket.id, { attachments: next })
  }

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitial = React.useRef(true)

  const save = React.useCallback(() => {
    const agent = agents.find((a) => a.id === assignedAgentId)
    onUpdate(ticket.id, { title, description: htmlToPlainText(description) ? description : undefined, status, category: category || undefined, assignedAgentLocalId: assignedAgentId || undefined, assignedAgentName: agent?.name })
  }, [ticket.id, title, description, status, category, assignedAgentId, agents, onUpdate])

  React.useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(save, 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [title, description, assignedAgentId, category])

  const handleStatusChange = (s: typeof status) => {
    setStatus(s)
    const agent = agents.find((a) => a.id === assignedAgentId)
    onUpdate(ticket.id, { title, description: htmlToPlainText(description) ? description : undefined, status: s, category: category || undefined, assignedAgentLocalId: assignedAgentId || undefined, assignedAgentName: agent?.name })
  }

  const handleComment = async () => {
    if (!commentInput.trim()) return
    const content = commentInput.trim()
    setCommentInput('')
    const comment = await onAddComment(ticket.id, content)
    if (comment) {
      setLocalComments((prev) => [...prev, comment])
    }
  }

  const STATUS_OPTS: { value: typeof status; labelKey: TranslationKey; color: string }[] = [
    { value: 'open', labelKey: 'tickets.open', color: '#3B82F6' },
    { value: 'in_progress', labelKey: 'tickets.inProgress', color: '#F59E0B' },
    { value: 'done', labelKey: 'tickets.done', color: '#10B981' },
  ]

  return (
    <div className="space-y-5">
      {/* Title */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-xl font-bold text-txt-primary bg-transparent border-none focus:outline-none focus:ring-0 p-0"
        style={{ boxShadow: 'none' }}
      />

      {/* Status — pill style with colored dots */}
      <div className="flex gap-1.5">
        {STATUS_OPTS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleStatusChange(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              status === opt.value ? '' : 'opacity-40 hover:opacity-70'
            }`}
            style={{
              backgroundColor: opt.color + '15',
              color: opt.color,
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {/* Category */}
      <div>
        <label className="text-[11px] text-txt-muted font-medium uppercase tracking-wide">{t('context.category')}</label>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {TICKET_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => {
                const newCat = category === cat.value ? '' : cat.value
                setCategory(newCat)
                const agent = agents.find((a) => a.id === assignedAgentId)
                onUpdate(ticket.id, { category: newCat || undefined, title, description: htmlToPlainText(description) ? description : undefined, status, assignedAgentLocalId: assignedAgentId || undefined, assignedAgentName: agent?.name })
              }}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                category === cat.value ? 'ring-1' : 'opacity-50 hover:opacity-80'
              }`}
              style={{
                backgroundColor: cat.color + '15',
                color: cat.color,
                ringColor: cat.color,
              }}
            >
              {t(CATEGORY_LABEL_KEYS[cat.value])}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-txt-muted font-medium uppercase tracking-wide">{t('common.description')}</label>
          <div className="flex items-center bg-surface-dark rounded-md p-0.5">
            <button
              onClick={() => setDescMode('edit')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                descMode === 'edit' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              Editor
            </button>
            <button
              onClick={() => setDescMode('preview')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                descMode === 'preview' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        {descMode === 'edit' ? (
          <RichTextEditor
            content={description}
            onChange={setDescription}
            placeholder={t('context.addDescription')}
            className="rounded-xl bg-white border border-border overflow-hidden focus-within:border-accent transition-colors"
            minHeight="120px"
          />
        ) : (
          <div className="px-3.5 py-2.5 rounded-xl bg-white border border-border min-h-[120px]">
            {htmlToPlainText(description) ? (
              looksLikeHtml(description) ? (
                <RichTextViewer content={description} className="text-sm leading-relaxed" />
              ) : (
                <div className="markdown-body text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                </div>
              )
            ) : (
              <p className="text-sm text-txt-muted/50 italic">{t('context.addDescription')}</p>
            )}
          </div>
        )}
      </div>

      {/* Attachments */}
      <div>
        <label className="text-[11px] text-txt-muted font-medium uppercase tracking-wide">
          {t('context.attachments')} {attachments.length > 0 && `(${attachments.length})`}
        </label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {attachments.map((att) => (
            <div key={att.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
              <a href={attachmentUrl(att.localPath)} target="_blank" rel="noreferrer" title={att.fileName}>
                <img src={attachmentUrl(att.localPath)} alt={att.fileName} className="w-full h-full object-cover" />
              </a>
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Entfernen"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => ticketFileInputRef.current?.click()}
            disabled={isUploading}
            className="w-16 h-16 rounded-lg border border-dashed border-border text-txt-muted hover:text-accent hover:border-accent transition-colors flex items-center justify-center disabled:opacity-40"
            title={t('ticketCreate.addImage')}
          >
            {isUploading ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </button>
          <input
            ref={ticketFileInputRef}
            type="file"
            accept={TICKET_IMAGE_MIME.join(',')}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploadAttachments(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
        </div>
        {attachmentError && <p className="text-xs text-red-500 mt-1.5">{attachmentError}</p>}
      </div>

      {/* Assigned */}
      <div>
        <label className="text-[11px] text-txt-muted font-medium uppercase tracking-wide">{t('context.assignedTo')}</label>
        <select
          value={assignedAgentId}
          onChange={(e) => setAssignedAgentId(e.target.value)}
          className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-border text-base text-txt-primary"
        >
          <option value="">{t('context.unassigned')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Comments */}
      <div className="pt-4 border-t border-border">
        <label className="text-[11px] text-txt-muted font-medium uppercase tracking-wide">
          {t('context.comments')} ({localComments.length})
        </label>

        <div className="mt-3 space-y-3 max-h-[280px] overflow-y-auto">
          {localComments.map((c) => {
            const agent = c.agentLocalId ? agents.find((a) => a.id === c.agentLocalId) : null
            return (
              <div key={c.id} className="flex gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-border">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] flex-shrink-0 font-medium"
                  style={agent ? { backgroundColor: agent.color + '18', color: agent.color } : { backgroundColor: '#6366F118', color: '#6366F1' }}
                >
                  {agent ? (agent.avatar || agent.name.charAt(0)) : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-txt-primary">
                      {c.authorType === 'agent' ? (c.agentName ?? 'Agent') : t('common.you')}
                    </span>
                    <span className="text-[10px] text-txt-muted">
                      {new Date(c.clientTimestamp).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="markdown-body text-sm text-txt-body mt-0.5 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex gap-1.5">
          <input
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
            placeholder={t('context.commentPlaceholder')}
            className="flex-1 px-3 py-2.5 rounded-xl bg-white border border-border text-sm text-txt-primary placeholder:text-txt-muted"
          />
          <button
            onClick={handleComment}
            disabled={!commentInput.trim()}
            className="px-3 py-2.5 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-dark disabled:opacity-30 transition-all"
          >
            {t('common.send')}
          </button>
        </div>
      </div>

      {/* Delete */}
      <div className="pt-4 border-t border-border">
        {confirmDelete ? (
          <div className="flex gap-2">
            <button onClick={() => onDelete(ticket.id)} className="flex-1 py-2 rounded-xl text-xs font-medium bg-status-error/15 text-status-error hover:bg-status-error/25 transition-colors">
              {t('common.delete')}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-xl text-xs text-txt-muted hover:bg-surface-hover transition-colors">
              {t('common.no')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2 rounded-xl text-xs text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
          >
            {t('context.deleteTicket')}
          </button>
        )}
      </div>
    </div>
  )
}

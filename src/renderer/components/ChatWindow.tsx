import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ChatMessage, ProjectAgent, MessageAttachment } from '@shared/types'
import MarkdownMessage from './MarkdownMessage'
import { useLanguage } from '../i18n/LanguageContext'
import { useIpc } from '../hooks/useIpc'

interface Props {
  projectName: string
  messages: ChatMessage[]
  agents: ProjectAgent[]
  onSendMessage: (content: string, attachments?: MessageAttachment[]) => void
  onDeleteMessage: (messageId: string) => void
  onRetryMessage: (messageId: string) => void
  onStopAgent: (messageId: string) => void
  onOpenThread: (userMessage: ChatMessage, replies: ChatMessage[]) => void
}

const MAX_IMAGES_PER_MESSAGE = 5
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']

interface PendingImage {
  id: string
  file: File
  previewUrl: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Group messages into threads: user message + agent replies
interface MessageGroup {
  userMessage: ChatMessage
  replies: ChatMessage[]
}

function groupMessages(messages: ChatMessage[]): (ChatMessage | MessageGroup)[] {
  // Build a map of parent message id → group for thread replies
  const groups = new Map<string, MessageGroup>()
  const result: (ChatMessage | MessageGroup)[] = []
  let currentGroup: MessageGroup | null = null

  for (const msg of messages) {
    if (msg.role === 'user') {
      // User message that is a thread reply → attach to existing group, don't start new group
      if (msg.replyToLocalId) {
        const parentGroup = groups.get(msg.replyToLocalId)
        if (parentGroup) {
          parentGroup.replies.push(msg)
          continue
        }
      }
      if (currentGroup) result.push(currentGroup)
      currentGroup = { userMessage: msg, replies: [] }
      groups.set(msg.id, currentGroup)
    } else {
      // Agent reply: attach to the group of the message it replies to
      if (msg.replyToLocalId) {
        const parentGroup = groups.get(msg.replyToLocalId)
        if (parentGroup) {
          parentGroup.replies.push(msg)
          continue
        }
      }
      if (currentGroup) {
        currentGroup.replies.push(msg)
      } else {
        result.push(msg)
      }
    }
  }
  if (currentGroup) result.push(currentGroup)
  return result
}

export default function ChatWindow({ projectName, messages, agents, onSendMessage, onDeleteMessage, onRetryMessage, onStopAgent, onOpenThread }: Props) {
  const { t, lang } = useLanguage()
  const ipc = useIpc()
  const [input, setInput] = useState('')
  const [attachedFile, setAttachedFile] = useState<{ fileName: string; content: string } | null>(null)
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [selectedAutocomplete, setSelectedAutocomplete] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const addImageFiles = useCallback((files: File[]) => {
    setImageError(null)
    if (files.length === 0) return
    const accepted: PendingImage[] = []
    for (const f of files) {
      if (!ALLOWED_IMAGE_MIME.includes(f.type.toLowerCase())) {
        setImageError(`Format nicht unterstützt: ${f.name}`)
        continue
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setImageError(`Bild zu groß (max 10 MB): ${f.name}`)
        continue
      }
      accepted.push({ id: crypto.randomUUID(), file: f, previewUrl: URL.createObjectURL(f) })
    }
    setPendingImages((prev) => {
      const merged = [...prev, ...accepted]
      if (merged.length > MAX_IMAGES_PER_MESSAGE) {
        setImageError(`Maximal ${MAX_IMAGES_PER_MESSAGE} Bilder pro Nachricht`)
        const dropped = merged.slice(MAX_IMAGES_PER_MESSAGE)
        dropped.forEach((d) => URL.revokeObjectURL(d.previewUrl))
        return merged.slice(0, MAX_IMAGES_PER_MESSAGE)
      }
      return merged
    })
  }, [])

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  useEffect(() => {
    return () => { pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredAgents = useMemo(() => {
    if (!autocompleteFilter) return agents
    return agents.filter((a) =>
      a.name.toLowerCase().includes(autocompleteFilter.toLowerCase()) ||
      a.mentionKey.toLowerCase().includes(autocompleteFilter.toLowerCase())
    )
  }, [agents, autocompleteFilter])

  const grouped = useMemo(() => groupMessages(messages.slice(-10)), [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const handleAttachFile = async () => {
    try {
      const result = await (window as any).orchestrator.pickAndReadFile([
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      ])
      if (result && !result.canceled && result.content) {
        setAttachedFile({ fileName: result.fileName!, content: result.content })
      }
    } catch (err) {
      console.error('Failed to pick file:', err)
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed && !attachedFile && pendingImages.length === 0) return
    if (isUploadingImages) return

    let message = trimmed
    if (attachedFile) {
      const fileBlock = `📎 **${attachedFile.fileName}**\n\`\`\`markdown\n${attachedFile.content}\n\`\`\``
      message = message ? `${message}\n\n${fileBlock}` : fileBlock
    }

    let savedAttachments: MessageAttachment[] = []
    if (pendingImages.length > 0) {
      setIsUploadingImages(true)
      const draftId = crypto.randomUUID()
      try {
        for (const img of pendingImages) {
          const base64 = await fileToBase64(img.file)
          const res = await ipc.saveAttachment(draftId, img.file.name, img.file.type, base64)
          if (res.success && res.attachment) {
            savedAttachments.push(res.attachment)
          } else {
            setImageError(res.error || 'Upload fehlgeschlagen')
            setIsUploadingImages(false)
            return
          }
        }
      } catch (err) {
        setImageError((err as Error).message)
        setIsUploadingImages(false)
        return
      }
      setIsUploadingImages(false)
    }

    onSendMessage(message, savedAttachments.length > 0 ? savedAttachments : undefined)

    pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    setPendingImages([])
    setImageError(null)
    setInput('')
    setAttachedFile(null)
    setShowAutocomplete(false)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f && ALLOWED_IMAGE_MIME.includes(f.type.toLowerCase())) {
          files.push(f)
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      addImageFiles(files)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => ALLOWED_IMAGE_MIME.includes(f.type.toLowerCase()))
    if (files.length > 0) addImageFiles(files)
  }

  const handleAttachImage = () => {
    imageInputRef.current?.click()
  }

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    addImageFiles(files)
    e.target.value = ''
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }
  }, [input])

  const timeLocale = lang === 'de' ? 'de-DE' : lang === 'tr' ? 'tr-TR' : 'en-GB'
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-surface-dark">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[820px] mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-txt-secondary mb-1">{t('chat.startConversation')}</p>
              <p className="text-xs text-txt-muted mb-4">{t('chat.mentionAgent')}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => { setInput(agent.mentionKey + ' '); textareaRef.current?.focus() }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                    style={{ backgroundColor: agent.color + '12', color: agent.color, border: `1px solid ${agent.color}20` }}
                  >
                    {agent.mentionKey}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="py-2">
            {grouped.map((item) => {
              // Standalone agent message (no preceding user message)
              if ('role' in item) {
                return <AgentMessageRow key={item.id} msg={item} agents={agents} formatTime={formatTime} onDelete={onDeleteMessage} onRetry={onRetryMessage} onStop={onStopAgent} onReply={(agent) => { setInput((prev) => prev.includes(agent.mentionKey) ? prev : (prev.trim() ? prev.trimEnd() + ' ' : '') + agent.mentionKey + ' '); textareaRef.current?.focus() }} />
              }

              // Thread group: user message + collapsed replies
              const group = item
              const hasReplies = group.replies.length > 0
              const replyCount = group.replies.length
              // Collect unique agent avatars for the thread preview
              const threadAgents = hasReplies
                ? Array.from(new Map(group.replies.map((r) => {
                    const a = agents.find((ag) => ag.id === r.agentLocalId)
                    return [r.agentLocalId, a]
                  }).filter(([, a]) => a)).values()).slice(0, 3) as ProjectAgent[]
                : []
              // Check if any reply is still streaming
              const isStreaming = group.replies.some((r) => r.status === 'streaming')

              return (
                <div key={group.userMessage.id}>
                  {/* User message */}
                  <UserMessageRow msg={group.userMessage} agents={agents} formatTime={formatTime} onDelete={onDeleteMessage} />

                  {/* Thread indicator (collapsed) */}
                  {hasReplies && (
                    <div className="ml-12 mb-1">
                      <button
                        onClick={() => onOpenThread(group.userMessage, group.replies)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors group/thread"
                      >
                        {/* Agent avatars stack */}
                        <div className="flex -space-x-1.5">
                          {threadAgents.map((agent) => (
                            <div
                              key={agent.id}
                              className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-medium ring-2 ring-surface-dark"
                              style={{ backgroundColor: agent.color + '25', color: agent.color }}
                            >
                              {agent.avatar || agent.name.charAt(0)}
                            </div>
                          ))}
                        </div>

                        <span className="text-xs font-medium text-accent group-hover/thread:underline">
                          {replyCount} {replyCount === 1 ? t('chat.reply') : t('chat.replies')}
                        </span>

                        {isStreaming && (
                          <div className="flex gap-0.5 items-center">
                            {[0, 150, 300].map((delay) => (
                              <span key={delay} className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                            ))}
                          </div>
                        )}

                        <span className="text-[10px] text-txt-muted">
                          {formatTime(group.replies[group.replies.length - 1].clientTimestamp)}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Typing indicators (no active stream) */}
            {agents
              .filter((a) => (a.status === 'thinking' || a.status === 'responding') && !messages.some((m) => m.agentLocalId === a.id && m.status === 'streaming'))
              .map((agent) => (
                <motion.div
                  key={`typing-${agent.id}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-2"
                >
                  <div className="w-9 flex-shrink-0" />
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0"
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
                </motion.div>
              ))}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area — white bar at bottom */}
      <div className="bg-white border-t border-border px-5 pb-5 pt-4 relative">
        <div className="max-w-[820px] mx-auto">
          {/* Autocomplete */}
          <AnimatePresence>
            {showAutocomplete && filteredAgents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute bottom-full left-0 right-0 mb-1 mx-5 rounded-xl bg-white border border-border shadow-lg overflow-hidden"
              >
                <div className="max-w-[820px] mx-auto">
                  {filteredAgents.map((agent, i) => (
                    <button
                      key={agent.id}
                      onClick={() => insertMention(agent)}
                      className={`flex items-center gap-3 w-full px-4 h-11 text-left transition-colors ${
                        i === selectedAutocomplete ? 'bg-accent-light' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-medium"
                        style={{ backgroundColor: agent.color + '18', color: agent.color }}
                      >
                        {agent.avatar || agent.name.charAt(0)}
                      </div>
                      <span className="text-sm text-txt-primary font-medium">{agent.name}</span>
                      <span className="text-xs text-txt-muted font-mono">{agent.mentionKey}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attached file preview */}
          {attachedFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-accent-light/50 border border-accent/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-xs font-medium text-accent truncate">{attachedFile.fileName}</span>
              <span className="text-[10px] text-txt-muted">({(attachedFile.content.length / 1024).toFixed(1)} KB)</span>
              <button
                onClick={() => setAttachedFile(null)}
                className="ml-auto p-0.5 rounded text-txt-muted hover:text-status-error transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Image previews */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="w-16 h-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    onClick={() => removePendingImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-status-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    title="Entfernen"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {imageError && (
            <div className="text-xs text-status-error mb-2">{imageError}</div>
          )}

          <div
            className={`relative ${isDragging ? 'ring-2 ring-accent rounded-xl' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={imageInputRef}
              type="file"
              accept={ALLOWED_IMAGE_MIME.join(',')}
              multiple
              hidden
              onChange={handleImageInputChange}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t('chat.inputPlaceholder')}
              rows={1}
              className="w-full resize-none rounded-xl pl-[88px] pr-14 py-3 text-base text-txt-primary placeholder:text-txt-muted bg-surface-light border border-border focus:border-accent focus:ring-0 transition-colors outline-none"
              style={{ maxHeight: '120px', minHeight: '48px' }}
            />
            {/* Attach text-file button */}
            <button
              onClick={handleAttachFile}
              className="absolute left-1.5 bottom-1.5 h-10 w-10 rounded-[10px] flex items-center justify-center text-txt-muted hover:text-accent hover:bg-accent-light/50 transition-colors"
              title={t('chat.attachFile')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            {/* Attach image button */}
            <button
              onClick={handleAttachImage}
              disabled={pendingImages.length >= MAX_IMAGES_PER_MESSAGE}
              className="absolute left-[44px] bottom-1.5 h-10 w-10 rounded-[10px] flex items-center justify-center text-txt-muted hover:text-accent hover:bg-accent-light/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Bild anhängen"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              disabled={(!input.trim() && !attachedFile && pendingImages.length === 0) || isUploadingImages}
              className="absolute right-1.5 bottom-1.5 h-10 w-10 rounded-[10px] bg-accent text-white flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:bg-accent-dark"
            >
              {isUploadingImages ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0110 10" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}

function attachmentUrl(localPath: string): string {
  const normalized = localPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/attachments/')
  const rel = idx >= 0 ? normalized.slice(idx + '/attachments/'.length) : normalized
  return 'attachment://' + rel.split('/').map(encodeURIComponent).join('/')
}

// ── User message row — solid indigo bubble with white text ───────────────────
function UserMessageRow({ msg, agents, formatTime, onDelete }: {
  msg: ChatMessage
  agents: ProjectAgent[]
  formatTime: (iso: string) => string
  onDelete: (id: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex gap-3 px-5 py-2 group transition-colors">
      <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="inline-block bg-accent text-white max-w-[85%]" style={{ borderRadius: '16px 16px 4px 16px', padding: '14px 18px' }}>
          {msg.attachments && msg.attachments.length > 0 && (
            <div className={`flex flex-wrap gap-2 ${msg.content?.trim() ? 'mb-3' : ''}`}>
              {msg.attachments.map((att) => (
                <a
                  key={att.id}
                  href={attachmentUrl(att.localPath)}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                  title={att.fileName}
                >
                  <img
                    src={attachmentUrl(att.localPath)}
                    alt={att.fileName}
                    className="max-h-48 max-w-[260px] rounded-lg border border-white/20 object-cover"
                  />
                </a>
              ))}
            </div>
          )}
          <div className="text-base leading-relaxed">
            <MessageContent content={msg.content} agents={agents} light />
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[13px] text-txt-muted">{formatTime(msg.clientTimestamp)}</span>
          {msg.metadata?.triggered_by === 'goal_loop' && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gradient-to-r from-violet-500/10 to-cyan-500/10 text-violet-600 font-medium">
              AUTONOM
            </span>
          )}
          <button
            onClick={() => onDelete(msg.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Agent message row — white card with border + shadow ─────────────────────
export function AgentMessageRow({ msg, agents, formatTime, onDelete, onRetry, onStop, onReply, compact }: {
  msg: ChatMessage
  agents: ProjectAgent[]
  formatTime: (iso: string) => string
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  /** Kills the Claude process behind this one streaming message. */
  onStop?: (id: string) => void
  onReply: (agent: ProjectAgent) => void
  compact?: boolean
}) {
  const { t } = useLanguage()
  const agent = agents.find((a) => a.id === msg.agentLocalId)
  const agentColor = agent?.color ?? '#6366F1'

  return (
    <div className="flex gap-3 px-5 py-2 group transition-colors">
      {compact ? (
        <div className="w-9 flex-shrink-0" />
      ) : (
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-sm font-medium"
          style={{ backgroundColor: agentColor + '18', color: agentColor }}
        >
          {agent?.avatar || msg.agentName?.charAt(0) || 'A'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="bg-white border border-border shadow-xs"
          style={{ borderRadius: '16px 16px 16px 4px', padding: '16px 20px' }}
        >
          {!compact && (
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-bold" style={{ color: agentColor }}>
                {msg.agentName ?? 'Agent'}
              </span>
              {agent && (
                <span className="text-[9px] font-mono px-1 py-0.5 rounded" style={{ backgroundColor: agentColor + '10', color: agentColor + 'aa' }}>
                  BOT
                </span>
              )}
              {msg.metadata?.triggered_by === 'goal_loop' && (
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-gradient-to-r from-violet-500/10 to-cyan-500/10 text-violet-600">
                  AUTONOM
                </span>
              )}
            </div>
          )}
          {/* Thinking block */}
          {msg.thinkingContent && <ThinkingBlock content={msg.thinkingContent} streaming={msg.status === 'streaming'} color={agentColor} />}
          {msg.status === 'error' && (
            <div className="flex items-center gap-1.5 mb-1 text-status-error text-[11px] font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {msg.errorCode === 'timeout' ? t('chat.timeout') : msg.errorCode === 'spawn_failed' ? t('chat.spawnFailed') : t('common.error')}
            </div>
          )}
          <div className={`text-base leading-relaxed ${msg.status === 'error' ? 'text-status-error/80' : 'text-txt-body'}`}>
            <MarkdownMessage content={msg.content} agents={agents} streaming={msg.status === 'streaming'} />
            {msg.status === 'streaming' && (
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
          {msg.status === 'streaming' && agent?.currentTool && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded mt-1.5 inline-flex items-center gap-1"
              style={{ backgroundColor: agentColor + '12', color: agentColor }}
            >
              <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {agent.currentTool}
            </span>
          )}
        </div>
        {/* Timestamp + actions below bubble */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[13px] text-txt-muted">{formatTime(msg.clientTimestamp)}</span>
          {msg.status === 'streaming' && onStop && (
            <button
              onClick={() => onStop(msg.id)}
              title={t('chat.stopAgentTitle')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-status-error/10 text-status-error hover:bg-status-error/20 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <rect x="1.5" y="1.5" width="7" height="7" rx="1.2" />
              </svg>
              {t('chat.stopAgent')}
            </button>
          )}
          {msg.status === 'error' && (
            <>
              <button
                onClick={() => onRetry(msg.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-status-error/10 text-status-error hover:bg-status-error/20 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                {t('common.retry')}
              </button>
              <button
                onClick={() => onDelete(msg.id)}
                className="px-2 py-1 rounded-md text-[11px] text-txt-muted hover:text-status-error transition-colors"
              >
                {t('common.discard')}
              </button>
            </>
          )}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
            {agent && (
              <button
                onClick={() => onReply(agent)}
                className="p-1 rounded-md text-txt-muted hover:text-accent hover:bg-accent-light transition-colors"
                title={`@${agent.name} ${t('chat.replyTo')}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onDelete(msg.id)}
              className="p-1 rounded-md text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mention-aware text renderer ──────────────────────────────────────────────
export function MessageContent({ content, agents, light }: { content: string; agents: ProjectAgent[]; light?: boolean }) {
  const parts = content.split(/(@[a-zA-Z0-9_-]+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const agent = agents.find((a) => a.mentionKey.toLowerCase() === part.toLowerCase())
          if (agent) {
            if (light) {
              return (
                <span key={i} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] font-semibold bg-white/20 text-white">
                  @{agent.name}
                </span>
              )
            }
            return (
              <span key={i} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] font-semibold" style={{ backgroundColor: agent.color + '15', color: agent.color }}>
                @{agent.name}
              </span>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Thinking block — collapsible display of agent reasoning ──────────────────
function ThinkingBlock({ content, streaming, color }: { content: string; streaming: boolean; color: string }) {
  const [open, setOpen] = useState(streaming)
  const lines = content.split('\n').length
  const chars = content.length

  // Auto-open while streaming, auto-collapse when done
  React.useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-medium transition-colors group"
        style={{ color: color + 'aa' }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        >
          <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {streaming ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color }} />
            Denkt nach...
          </span>
        ) : (
          <span className="group-hover:underline">
            Denkprozess ({lines} Zeilen, {chars > 1000 ? `${(chars / 1000).toFixed(1)}k` : chars} Zeichen)
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mt-1.5 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed overflow-y-auto whitespace-pre-wrap font-mono"
              style={{
                maxHeight: '300px',
                backgroundColor: color + '08',
                color: color + 'cc',
                borderLeft: `2px solid ${color}30`,
              }}
            >
              {content}
              {streaming && <span className="inline-block w-1 h-3 ml-0.5 animate-pulse rounded-sm" style={{ backgroundColor: color }} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import type { MessageAttachment, ProjectAgent } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, Spinner, cn } from '../../ui'
import { CloseIcon } from '../../ui/icons'
import {
  attachmentUrl,
  isImage,
  mentionedAgentIds,
  readFileAsBase64,
  splitMentions,
} from './chatHelpers'

/** Höchsthöhe des Eingabefelds — etwa 40 % des Fensters, wie im Entwurf vorgesehen. */
function maxComposerHeight(): number {
  return Math.round(window.innerHeight * 0.4)
}

interface MentionContext {
  start: number
  query: string
}

/** Findet eine angefangene Erwähnung links vom Cursor. */
function detectMention(text: string, caret: number): MentionContext | null {
  const before = text.slice(0, caret)
  const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(before)
  if (!match) return null
  return { start: caret - match[1].length - 1, query: match[1] }
}

export interface ComposerHandle {
  insertMention: (mentionKey: string) => void
  focus: () => void
}

export interface ComposerProps {
  agents: ProjectAgent[]
  placeholder: string
  disabled?: boolean
  autoFocus?: boolean
  onSend: (input: {
    content: string
    mentions: string[]
    attachmentIds: string[]
  }) => Promise<unknown>
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { agents, placeholder, disabled = false, autoFocus = false, onSend },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const pendingCaret = useRef<number | null>(null)

  const [text, setText] = useState('')
  const [mention, setMention] = useState<MentionContext | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const candidates = mention
    ? agents.filter((agent) => {
        const query = mention.query.toLowerCase()
        if (!query) return true
        return (
          agent.mentionKey.slice(1).toLowerCase().includes(query) ||
          agent.name.toLowerCase().includes(query)
        )
      })
    : []

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxComposerHeight())}px`
  }, [text])

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null) return
    pendingCaret.current = null
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
  }, [text])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  function updateMention(value: string, caret: number): void {
    const next = detectMention(value, caret)
    setMention(next)
    setHighlighted(0)
  }

  function replaceRange(start: number, end: number, insert: string): void {
    const next = `${text.slice(0, start)}${insert}${text.slice(end)}`
    pendingCaret.current = start + insert.length
    setText(next)
    setMention(null)
  }

  function acceptMention(agent: ProjectAgent): void {
    const textarea = textareaRef.current
    if (!mention || !textarea) return
    replaceRange(mention.start, textarea.selectionStart, `${agent.mentionKey} `)
  }

  useImperativeHandle(ref, () => ({
    insertMention: (mentionKey: string) => {
      const textarea = textareaRef.current
      const caret = textarea?.selectionStart ?? text.length
      const needsSpace = caret > 0 && !/\s$/.test(text.slice(0, caret))
      replaceRange(caret, caret, `${needsSpace ? ' ' : ''}${mentionKey} `)
    },
    focus: () => textareaRef.current?.focus(),
  }))

  async function upload(files: File[]): Promise<void> {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of images) {
        const dataBase64 = await readFileAsBase64(file)
        const saved = await window.api.chat.saveAttachment({
          fileName: file.name || 'Bild.png',
          mimeType: file.type || null,
          dataBase64,
        })
        setAttachments((current) => [...current, saved])
      }
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setUploading(false)
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(event.clipboardData.files)
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault()
      void upload(files)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragOver(false)
    void upload(Array.from(event.dataTransfer.files))
  }

  async function send(): Promise<void> {
    const content = text.trim()
    if ((!content && attachments.length === 0) || sending || disabled) return
    setSending(true)
    setError(null)
    try {
      await onSend({
        content,
        mentions: mentionedAgentIds(content, agents),
        attachmentIds: attachments.map((attachment) => attachment.id),
      })
      setText('')
      setAttachments([])
      setMention(null)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (mention && candidates.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted((current) => (current + 1) % candidates.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted((current) => (current - 1 + candidates.length) % candidates.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const agent = candidates[Math.min(highlighted, candidates.length - 1)]
        if (agent) acceptMention(agent)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMention(null)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  const mentions = mentionedAgentIds(text, agents)
  const showMentionHint = text.trim().length > 0 && mentions.length === 0 && agents.length > 0
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !sending && !disabled

  return (
    <div
      className={cn(
        'shrink-0 border-t border-line bg-surface px-3 py-2 transition-colors',
        dragOver && 'bg-accent-soft',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {error && (
        <p className="mb-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="relative">
              {isImage(attachment) ? (
                <img
                  src={attachmentUrl(attachment)}
                  alt={attachment.fileName}
                  className="h-16 w-16 rounded border border-line object-cover"
                />
              ) : (
                <span className="inline-block max-w-[9rem] truncate rounded border border-line px-2 py-1 text-xs text-ink-muted">
                  {attachment.fileName}
                </span>
              )}
              <button
                type="button"
                aria-label={`${attachment.fileName} entfernen`}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.id !== attachment.id),
                  )
                }
                className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-overlay text-ink-muted hover:text-ink"
              >
                <CloseIcon width={11} height={11} />
              </button>
            </div>
          ))}
          {uploading && <Spinner size={16} className="self-center text-ink-muted" />}
        </div>
      )}

      <div className="relative">
        {mention && candidates.length > 0 && (
          <ul className="absolute bottom-full left-0 z-40 mb-1 max-h-60 w-72 overflow-auto rounded-md border border-line bg-overlay py-1 shadow-lg">
            {candidates.map((agent, index) => (
              <li key={agent.id}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    acceptMention(agent)
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm',
                    index === highlighted ? 'bg-raised' : 'hover:bg-raised',
                    agent.stopped && 'opacity-50',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="truncate text-ink">{agent.name}</span>
                  {agent.title && (
                    <span className="truncate text-xs text-ink-faint">{agent.title}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">
                    {agent.stopped ? 'gestoppt' : agent.mentionKey}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative rounded-md border border-line bg-base focus-within:border-accent">
          {/* Spiegel des Textes hinter dem Feld — nur er kann Erwähnungen einfärben. */}
          <div
            ref={backdropRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed text-transparent"
          >
            {splitMentions(text, agents).map((segment, index) =>
              segment.agent ? (
                <span
                  key={index}
                  className="rounded"
                  style={{
                    color: segment.agent.color,
                    backgroundColor: `${segment.agent.color}22`,
                  }}
                >
                  {segment.text}
                </span>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
            {'\n'}
          </div>

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => {
              setText(event.target.value)
              updateMention(event.target.value, event.target.selectionStart)
            }}
            onSelect={(event) =>
              updateMention(event.currentTarget.value, event.currentTarget.selectionStart)
            }
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onScroll={(event) => {
              if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop
            }}
            className={cn(
              'relative block w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed',
              'text-transparent caret-ink placeholder:text-ink-faint focus:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
          {showMentionHint
            ? `Ohne Erwähnung antwortet niemand — verfügbar: ${agents
                .map((agent) => agent.mentionKey)
                .join(', ')}`
            : 'Enter sendet · Shift+Enter für eine neue Zeile · Bilder einfügen oder ablegen'}
        </span>
        <Button
          variant="primary"
          size="sm"
          loading={sending}
          disabled={!canSend}
          onClick={() => void send()}
        >
          Senden
        </Button>
      </div>
    </div>
  )
})

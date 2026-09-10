import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { ATTACHMENT_ACCEPT } from '@shared/constants'
import type { MessageAttachment, ProjectAgent } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, IconButton, Spinner, cn } from '../../ui'
import { PaperclipIcon } from '../../ui/icons'
import { AttachmentList, attachmentFileName, selectAttachableFiles } from '../attachments'
import { roleLabel } from '../agents/agentHelpers'
import { mentionedAgentIds, readFileAsBase64, splitMentions } from './chatHelpers'

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

/** Ein Eintrag des @-Menüs — `assigned: false` steht für einen erst noch zuzuordnenden Agenten. */
interface MentionOption {
  agent: ProjectAgent
  assigned: boolean
}

export interface ComposerProps {
  agents: ProjectAgent[]
  /**
   * Globale Agenten, die dem Projekt nicht zugeordnet sind. Sie erscheinen im @-Menü als
   * zweiter Abschnitt und werden bei Auswahl über `onAssignAgent` zugeordnet.
   */
  unassignedAgents?: ProjectAgent[]
  onAssignAgent?: (agent: ProjectAgent) => Promise<unknown>
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
  {
    agents,
    unassignedAgents = [],
    onAssignAgent,
    placeholder,
    disabled = false,
    autoFocus = false,
    onSend,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [mention, setMention] = useState<MentionContext | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  function matchesQuery(agent: ProjectAgent, query: string): boolean {
    if (!query) return true
    return (
      agent.mentionKey.slice(1).toLowerCase().includes(query) ||
      agent.name.toLowerCase().includes(query)
    )
  }

  // Beide Abschnitte hängen an derselben Liste, damit die Pfeiltasten über sie hinweglaufen.
  const options: MentionOption[] = mention
    ? [
        ...agents
          .filter((agent) => matchesQuery(agent, mention.query.toLowerCase()))
          .map((agent) => ({ agent, assigned: true })),
        ...(onAssignAgent
          ? unassignedAgents
              .filter((agent) => matchesQuery(agent, mention.query.toLowerCase()))
              .map((agent) => ({ agent, assigned: false }))
          : []),
      ]
    : []

  const assignedCount = options.filter((option) => option.assigned).length

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
    pendingCaret.current = start + insert.length
    setText((current) => `${current.slice(0, start)}${insert}${current.slice(end)}`)
    setMention(null)
  }

  /**
   * Ein nicht zugeordneter Agent wird erst dem Projekt zugeschlagen und landet erst danach
   * im Text — schlägt die Zuordnung fehl, bleibt das Feld unverändert.
   */
  async function acceptOption(option: MentionOption): Promise<void> {
    const textarea = textareaRef.current
    if (!mention || !textarea || assigningId) return
    const { start } = mention
    const end = textarea.selectionStart
    const insert = `${option.agent.mentionKey} `

    if (option.assigned || !onAssignAgent) {
      replaceRange(start, end, insert)
      return
    }

    setAssigningId(option.agent.id)
    setError(null)
    try {
      await onAssignAgent(option.agent)
      replaceRange(start, end, insert)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setAssigningId(null)
      textareaRef.current?.focus()
    }
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
    const { accepted, error: rejection } = selectAttachableFiles(files)
    setError(rejection)
    if (accepted.length === 0) return
    setUploading(true)
    try {
      for (const file of accepted) {
        const dataBase64 = await readFileAsBase64(file)
        const saved = await window.api.chat.saveAttachment({
          fileName: attachmentFileName(file),
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

  function pickFiles(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? [])
    // Zurücksetzen, damit dieselbe Datei direkt noch einmal gewählt werden kann.
    event.target.value = ''
    if (files.length > 0) void upload(files)
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(event.clipboardData.files)
    if (files.length === 0) return
    event.preventDefault()
    void upload(files)
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
    if (mention && options.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted((current) => (current + 1) % options.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted((current) => (current - 1 + options.length) % options.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const option = options[Math.min(highlighted, options.length - 1)]
        if (option) void acceptOption(option)
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
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !sending && !disabled

  // Ohne Zuordnung kann niemand antworten — das muss beim Tippen dastehen, nicht erst danach.
  const hint =
    text.trim().length === 0 || mentions.length > 0
      ? 'Enter sendet · Shift+Enter für eine neue Zeile · Dateien ablegen, einfügen oder anhängen'
      : agents.length === 0
        ? unassignedAgents.length > 0 && onAssignAgent
          ? 'Diesem Projekt ist kein Agent zugeordnet — tippe @ und wähle einen aus, das ordnet ihn zu.'
          : 'Diesem Projekt ist kein Agent zugeordnet — unter „Agenten" mindestens einen hinzufügen.'
        : `Ohne Erwähnung antwortet niemand — verfügbar: ${agents
            .map((agent) => agent.mentionKey)
            .join(', ')}`

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

      {(attachments.length > 0 || uploading) && (
        <AttachmentList
          className="mb-2"
          attachments={attachments}
          onRemove={(attachment) =>
            setAttachments((current) => current.filter((item) => item.id !== attachment.id))
          }
        >
          {uploading && <Spinner size={16} className="text-ink-muted" />}
        </AttachmentList>
      )}

      <div className="relative">
        {mention && options.length > 0 && (
          <ul className="absolute bottom-full left-0 z-40 mb-1 max-h-72 w-80 overflow-auto rounded-md border border-line bg-overlay py-1 shadow-lg">
            {options.map((option, index) => {
              const agent = option.agent
              const assigning = assigningId === agent.id
              return (
                <li key={`${option.assigned ? 'in' : 'out'}-${agent.id}`}>
                  {/* Kopfzeile des zweiten Abschnitts — sie steht vor dem ersten fremden Agenten. */}
                  {!option.assigned && index === assignedCount && (
                    <p
                      className={cn(
                        'px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-ink-faint',
                        assignedCount > 0 && 'mt-1 border-t border-line',
                      )}
                    >
                      Nicht in diesem Projekt — Auswahl ordnet zu
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={assigningId !== null && !assigning}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      void acceptOption(option)
                    }}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm',
                      index === highlighted ? 'bg-raised' : 'hover:bg-raised',
                      (agent.stopped || !option.assigned) && 'opacity-60',
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="truncate text-ink">{agent.name}</span>
                    {option.assigned ? (
                      agent.title && (
                        <span className="truncate text-xs text-ink-faint">{agent.title}</span>
                      )
                    ) : (
                      <span className="truncate text-xs text-ink-faint">
                        {roleLabel(agent.role)}
                      </span>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-ink-faint">
                      {assigning && <Spinner size={12} />}
                      {option.assigned && agent.stopped ? 'gestoppt' : agent.mentionKey}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="relative rounded-md border border-line bg-base focus-within:border-accent">
          {/* Spiegel des Textes hinter dem Feld — nur er kann Erwähnungen einfärben. */}
          <div
            ref={backdropRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed text-ink"
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={pickFiles}
        />
        <IconButton
          label="Datei anhängen"
          icon={<PaperclipIcon />}
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{hint}</span>
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

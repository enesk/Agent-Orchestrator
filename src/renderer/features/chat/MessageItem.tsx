import type { ChatMessage, ProjectAgent } from '@shared/types'
import type { ToolEvent } from '../../store/chatStore'
import { Spinner, cn } from '../../ui'
import { attachmentUrl, formatTime, isImage, splitMentions } from './chatHelpers'
import { MessageMarkdown } from './MessageMarkdown'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolChips } from './ToolChips'

export interface MessageItemProps {
  message: ChatMessage
  agent: ProjectAgent | null
  agents: ProjectAgent[]
  tools: ToolEvent[]
  /** Erste Nachricht einer Absenderfolge — nur sie zeigt Name und Uhrzeit. */
  startsGroup: boolean
  replyCount: number
  onRetry: () => void
  onStop: () => void
  onDelete: () => void
  onOpenThread: (() => void) | null
}

/** Fehlertext einer fehlgeschlagenen Nachricht — die Engine legt ihn in die Metadaten. */
function errorText(message: ChatMessage): string {
  const fromMetadata = message.metadata.error
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata
  if (message.errorCode) return message.errorCode
  return 'Der Agent hat nicht geantwortet.'
}

const squash = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Bricht die CLI ab, steht ihre Meldung oft schon als Teiltext im Stream. Dann wäre der rote
 * Kasten nur eine Wiederholung — die Schaltfläche „Wiederholen" bleibt trotzdem stehen.
 */
function visibleErrorText(message: ChatMessage): string | null {
  const text = errorText(message)
  const content = squash(message.content)
  if (content && content.includes(squash(text))) return null
  return text
}

export function MessageItem({
  message,
  agent,
  agents,
  tools,
  startsGroup,
  replyCount,
  onRetry,
  onStop,
  onDelete,
  onOpenThread,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const streaming = message.status === 'streaming'

  if (isSystem) {
    return (
      <div className="px-4 py-1 text-center">
        <span className="text-xs italic text-ink-faint">{message.content}</span>
      </div>
    )
  }

  const actions = (
    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
      {streaming && (
        <button type="button" onClick={onStop} className="text-[11px] text-ink-faint hover:text-ink">
          Stoppen
        </button>
      )}
      {message.status === 'error' && (
        <button type="button" onClick={onRetry} className="text-[11px] text-ink-faint hover:text-ink">
          Wiederholen
        </button>
      )}
      {onOpenThread && (
        <button
          type="button"
          onClick={onOpenThread}
          className="text-[11px] text-ink-faint hover:text-ink"
        >
          Im Thread antworten
        </button>
      )}
      <button type="button" onClick={onDelete} className="text-[11px] text-ink-faint hover:text-danger">
        Löschen
      </button>
    </div>
  )

  return (
    <div
      className={cn(
        'group/message px-4 py-0.5',
        startsGroup && 'mt-3 first:mt-0',
        isUser ? 'flex flex-col items-end' : 'flex flex-col items-start',
      )}
    >
      <div className={cn('flex w-full max-w-3xl gap-2', isUser && 'flex-row-reverse')}>
        <div className={cn('min-w-0 flex-1', isUser && 'flex flex-col items-end')}>
          {startsGroup && (
            <div
              className={cn(
                'mb-1 flex items-center gap-2 text-[11px]',
                isUser && 'flex-row-reverse',
              )}
            >
              {isUser ? (
                <span className="font-medium text-ink-muted">Du</span>
              ) : (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: agent?.color ?? '#6b7583' }}
                  />
                  <span className="font-medium text-ink">{agent?.name ?? 'Agent'}</span>
                  {agent?.title && <span className="text-ink-faint">{agent.title}</span>}
                </>
              )}
              <span className="text-ink-faint">{formatTime(message.createdAt)}</span>
            </div>
          )}

          {!isUser && tools.length > 0 && <ToolChips tools={tools} />}
          {!isUser && message.thinking && <ThinkingBlock thinking={message.thinking} />}

          <div
            className={cn(
              'inline-block max-w-full rounded-lg px-3 py-2',
              isUser ? 'bg-raised text-ink' : 'bg-surface',
              message.status === 'error' && 'border border-danger/40 bg-danger/5',
            )}
          >
            {isUser ? (
              // Nutzertext bleibt wörtlich stehen; nur Erwähnungen werden eingefärbt.
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                {splitMentions(message.content, agents).map((segment, index) =>
                  segment.agent ? (
                    <span
                      key={index}
                      className="rounded px-1 py-0.5 font-medium"
                      style={{
                        color: segment.agent.color,
                        backgroundColor: `${segment.agent.color}1a`,
                      }}
                    >
                      {segment.text}
                    </span>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </p>
            ) : message.content ? (
              <MessageMarkdown content={message.content} />
            ) : streaming ? (
              <span className="inline-flex items-center gap-2 text-xs text-ink-faint">
                <Spinner size={12} />
                schreibt …
              </span>
            ) : (
              <span className="text-xs italic text-ink-faint">Keine Antwort</span>
            )}

            {streaming && message.content && (
              <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent align-text-bottom" />
            )}

            {message.status === 'error' && (
              <div className="mt-2 flex items-center gap-2 border-t border-danger/30 pt-2">
                <span className="min-w-0 flex-1 text-xs text-danger">
                  {visibleErrorText(message)}
                </span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="shrink-0 rounded border border-danger/40 px-1.5 py-0.5 text-[11px] text-danger hover:bg-danger/10"
                >
                  Wiederholen
                </button>
              </div>
            )}

            {message.status === 'stopped' && (
              <p className="mt-1 text-[11px] italic text-ink-faint">Abgebrochen</p>
            )}
          </div>

          {message.attachments.length > 0 && (
            <div className={cn('mt-1.5 flex flex-wrap gap-1.5', isUser && 'justify-end')}>
              {message.attachments.map((attachment) =>
                isImage(attachment) ? (
                  <img
                    key={attachment.id}
                    src={attachmentUrl(attachment)}
                    alt={attachment.fileName}
                    className="max-h-48 rounded-md border border-line object-contain"
                  />
                ) : (
                  <span
                    key={attachment.id}
                    className="rounded border border-line px-2 py-1 text-xs text-ink-muted"
                  >
                    {attachment.fileName}
                  </span>
                ),
              )}
            </div>
          )}

          {replyCount > 0 && onOpenThread && (
            <button
              type="button"
              onClick={onOpenThread}
              className="mt-1 text-[11px] text-accent hover:underline"
            >
              {replyCount === 1 ? '1 Antwort' : `${replyCount} Antworten`}
            </button>
          )}
        </div>

        {actions}
      </div>
    </div>
  )
}

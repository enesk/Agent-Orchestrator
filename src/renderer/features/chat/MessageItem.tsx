import { memo } from 'react'
import type { ChatMessage, MessageAttachment, ProjectAgent } from '@shared/types'
import type { ToolEvent } from '../../store/chatStore'
import { Spinner, cn } from '../../ui'
import { AttachmentList } from '../attachments'
import { autoMentionAgent, formatTime, splitMentions } from './chatHelpers'
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
  /**
   * Die Rückrufe bekommen die Nachrichten-ID übergeben, statt sie zu schließen: Eine
   * Pfeilfunktion je Nachricht und Renderdurchlauf hätte bei jedem Streaming-Ereignis eine
   * neue Identität — `memo` unten liefe damit ins Leere.
   */
  onRetry: (messageId: string) => void
  onStop: (messageId: string) => void
  onDelete: (messageId: string) => void
  onOpenThread: ((messageId: string) => void) | null
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

function MessageItemComponent({
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
  const autoMention = isUser ? autoMentionAgent(message, agents) : null

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
        <button
          type="button"
          onClick={() => onStop(message.id)}
          className="text-[11px] text-ink-faint hover:text-ink"
        >
          Stoppen
        </button>
      )}
      {message.status === 'error' && (
        <button
          type="button"
          onClick={() => onRetry(message.id)}
          className="text-[11px] text-ink-faint hover:text-ink"
        >
          Wiederholen
        </button>
      )}
      {onOpenThread && (
        <button
          type="button"
          onClick={() => onOpenThread(message.id)}
          className="text-[11px] text-ink-faint hover:text-ink"
        >
          Im Thread antworten
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(message.id)}
        className="text-[11px] text-ink-faint hover:text-danger"
      >
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
                  onClick={() => onRetry(message.id)}
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

          {autoMention && (
            <p className="mt-1 text-[11px] text-ink-faint">
              ↳ an{' '}
              <span className="font-medium" style={{ color: autoMention.color }}>
                {autoMention.mentionKey}
              </span>
            </p>
          )}

          {message.attachments.length > 0 && (
            <AttachmentList
              className={cn('mt-1.5', isUser && 'justify-end')}
              attachments={message.attachments}
              imagePreview="large"
            />
          )}

          {replyCount > 0 && onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message.id)}
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

function sameAttachments(a: MessageAttachment[], b: MessageAttachment[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((attachment, index) => attachment.id === b[index]!.id)
}

/**
 * Verglichen wird nur, was die Darstellung bestimmt. Während ein Agent streamt, trifft alle
 * 60 ms ein Ereignis ein und der ganze Verlauf rendert erneut — ohne diesen Vergleich würde
 * dabei auch jede unveränderte Nachricht ihr Markdown noch einmal parsen.
 */
function areEqual(previous: MessageItemProps, next: MessageItemProps): boolean {
  const a = previous.message
  const b = next.message
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.thinking === b.thinking &&
    a.status === b.status &&
    a.errorCode === b.errorCode &&
    a.role === b.role &&
    a.agentId === b.agentId &&
    a.createdAt === b.createdAt &&
    a.metadata === b.metadata &&
    sameAttachments(a.attachments, b.attachments) &&
    previous.agent === next.agent &&
    previous.agents === next.agents &&
    previous.tools === next.tools &&
    previous.startsGroup === next.startsGroup &&
    previous.replyCount === next.replyCount &&
    previous.onRetry === next.onRetry &&
    previous.onStop === next.onStop &&
    previous.onDelete === next.onDelete &&
    previous.onOpenThread === next.onOpenThread
  )
}

export const MessageItem = memo(MessageItemComponent, areEqual)

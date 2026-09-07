import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage, ProjectAgent } from '@shared/types'
import type { ToolEvent } from '../../store/chatStore'
import { cn } from '../../ui'
import { ChevronDownIcon } from '../../ui/icons'
import { formatDaySeparator, isSameDay, startsGroup } from './chatHelpers'
import { MessageItem } from './MessageItem'

/** Ab dieser Entfernung zum Ende gilt der Verlauf als „unten" und folgt dem Stream. */
const BOTTOM_THRESHOLD = 64

export interface MessageListProps {
  messages: ChatMessage[]
  agents: ProjectAgent[]
  agentById: Map<string, ProjectAgent>
  tools: Record<string, ToolEvent[]>
  replyCounts: Record<string, number>
  onRetry: (messageId: string) => void
  onStop: (messageId: string) => void
  onDelete: (messageId: string) => void
  onOpenThread: ((messageId: string) => void) | null
  className?: string
}

const NO_TOOLS: ToolEvent[] = []

export function MessageList({
  messages,
  agents,
  agentById,
  tools,
  replyCounts,
  onRetry,
  onStop,
  onDelete,
  onOpenThread,
  className,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
    setAtBottom(true)
  }, [])

  function onScroll(): void {
    const container = containerRef.current
    if (!container) return
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    setAtBottom(distance <= BOTTOM_THRESHOLD)
  }

  // Dem wachsenden Text folgen, solange der Nutzer unten steht — scrollt er hoch, bleibt
  // die Ansicht stehen und der Knopf „Nach unten" erscheint.
  useLayoutEffect(() => {
    if (!atBottom) return
    const container = containerRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [messages, atBottom])

  useEffect(() => {
    scrollToBottom()
    // Beim Projektwechsel kommt eine neue Liste — dann immer ans Ende springen.
  }, [scrollToBottom])

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-auto py-3">
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt)
          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 px-4">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-[11px] text-ink-faint">
                    {formatDaySeparator(message.createdAt)}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <MessageItem
                message={message}
                agent={message.agentId ? agentById.get(message.agentId) ?? null : null}
                agents={agents}
                tools={tools[message.id] ?? NO_TOOLS}
                startsGroup={newDay || startsGroup(message, previous)}
                replyCount={replyCounts[message.id] ?? 0}
                onRetry={() => onRetry(message.id)}
                onStop={() => onStop(message.id)}
                onDelete={() => onDelete(message.id)}
                onOpenThread={onOpenThread ? () => onOpenThread(message.id) : null}
              />
            </div>
          )
        })}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className={cn(
            'absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line',
            'bg-overlay px-3 py-1.5 text-xs text-ink shadow-lg transition-colors hover:bg-raised',
            'inline-flex items-center gap-1',
          )}
        >
          <ChevronDownIcon width={14} height={14} />
          Nach unten
        </button>
      )}
    </div>
  )
}

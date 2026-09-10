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
  /** Es liegen ältere Nachrichten bereit, die noch niemand geladen hat. */
  hasOlder: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  /** Breitenbegrenzung des Inhalts — nur er wird zentriert, der Rollbereich bleibt voll breit. */
  contentClassName?: string
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
  hasOlder,
  loadingOlder,
  onLoadOlder,
  contentClassName,
  className,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  /**
   * Abstand zum unteren Ende, gemerkt kurz bevor oben Nachrichten eingefügt werden. Danach
   * wird er wiederhergestellt — sonst spränge die Ansicht um die Höhe der neuen Nachrichten.
   */
  const restoreDistance = useRef<number | null>(null)

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
    const container = containerRef.current
    if (!container) return

    const distance = restoreDistance.current
    if (distance !== null) {
      restoreDistance.current = null
      container.scrollTop = container.scrollHeight - distance
      return
    }

    if (!atBottom) return
    container.scrollTop = container.scrollHeight
  }, [messages, atBottom])

  function loadOlder(): void {
    const container = containerRef.current
    restoreDistance.current = container ? container.scrollHeight - container.scrollTop : null
    onLoadOlder()
  }

  useEffect(() => {
    scrollToBottom()
    // Beim Projektwechsel kommt eine neue Liste — dann immer ans Ende springen.
  }, [scrollToBottom])

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-auto py-3">
        <div className={cn('w-full', contentClassName)}>
          {hasOlder && (
            <div className="mb-2 flex justify-center px-4">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className={cn(
                  'rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted',
                  'transition-colors hover:bg-raised hover:text-ink disabled:opacity-50',
                )}
              >
                {loadingOlder ? 'Wird geladen …' : 'Ältere Nachrichten laden'}
              </button>
            </div>
          )}
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
                  onRetry={onRetry}
                  onStop={onStop}
                  onDelete={onDelete}
                  onOpenThread={onOpenThread}
                />
              </div>
            )
          })}
        </div>
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

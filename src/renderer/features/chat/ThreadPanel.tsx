import type { ChatMessage, ProjectAgent } from '@shared/types'
import type { ToolEvent } from '../../store/chatStore'
import { EmptyState, IconButton, Spinner } from '../../ui'
import { CloseIcon } from '../../ui/icons'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'
import { startsGroup } from './chatHelpers'

export interface ThreadPanelProps {
  root: ChatMessage | null
  replies: ChatMessage[]
  agents: ProjectAgent[]
  agentById: Map<string, ProjectAgent>
  tools: Record<string, ToolEvent[]>
  loading: boolean
  error: string | null
  onClose: () => void
  onRetry: (messageId: string) => void
  onStop: (messageId: string) => void
  onDelete: (messageId: string) => void
  onSend: (input: {
    content: string
    mentions: string[]
    attachmentIds: string[]
  }) => Promise<unknown>
}

export function ThreadPanel({
  root,
  replies,
  agents,
  agentById,
  tools,
  loading,
  error,
  onClose,
  onRetry,
  onStop,
  onDelete,
  onSend,
}: ThreadPanelProps) {
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <span className="text-sm font-medium text-ink">Thread</span>
        <IconButton label="Thread schließen" icon={<CloseIcon />} onClick={onClose} />
      </header>

      {!root ? (
        <EmptyState
          title="Nachricht nicht verfügbar"
          description="Die Ursprungsnachricht wurde inzwischen gelöscht."
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto py-2">
            <MessageItem
              message={root}
              agent={root.agentId ? agentById.get(root.agentId) ?? null : null}
              agents={agents}
              tools={tools[root.id] ?? []}
              startsGroup
              replyCount={0}
              onRetry={() => onRetry(root.id)}
              onStop={() => onStop(root.id)}
              onDelete={() => onDelete(root.id)}
              onOpenThread={null}
            />

            <div className="my-2 flex items-center gap-3 px-4">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] text-ink-faint">
                {replies.length === 0
                  ? 'Noch keine Antworten'
                  : replies.length === 1
                    ? '1 Antwort'
                    : `${replies.length} Antworten`}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {loading && (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            )}
            {error && (
              <p className="mx-4 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                {error}
              </p>
            )}

            {replies.map((reply, index) => (
              <MessageItem
                key={reply.id}
                message={reply}
                agent={reply.agentId ? agentById.get(reply.agentId) ?? null : null}
                agents={agents}
                tools={tools[reply.id] ?? []}
                startsGroup={startsGroup(reply, replies[index - 1])}
                replyCount={0}
                onRetry={() => onRetry(reply.id)}
                onStop={() => onStop(reply.id)}
                onDelete={() => onDelete(reply.id)}
                onOpenThread={null}
              />
            ))}
          </div>

          <Composer
            agents={agents}
            autoFocus
            placeholder="Im Thread antworten …"
            onSend={onSend}
          />
        </>
      )}
    </aside>
  )
}

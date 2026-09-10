import type { ChatMessage, ProjectAgent } from '@shared/types'
import { useT } from '../../i18n'
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

/** Eine geteilte leere Liste — ein frisches `[]` je Renderdurchlauf bräche `memo`. */
const NO_TOOLS: ToolEvent[] = []

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
  const t = useT()
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-canvas">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <span className="text-sm font-medium text-ink">{t('chat.thread.title')}</span>
        <IconButton label={t('chat.thread.close')} icon={<CloseIcon />} onClick={onClose} />
      </header>

      {!root ? (
        <EmptyState
          title={t('chat.thread.missing.title')}
          description={t('chat.thread.missing.description')}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto py-2">
            <MessageItem
              message={root}
              agent={root.agentId ? agentById.get(root.agentId) ?? null : null}
              agents={agents}
              tools={tools[root.id] ?? NO_TOOLS}
              startsGroup
              replyCount={0}
              onRetry={onRetry}
              onStop={onStop}
              onDelete={onDelete}
              onOpenThread={null}
            />

            <div className="my-2 flex items-center gap-3 px-4">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] text-ink-faint">
                {replies.length === 0
                  ? t('chat.thread.noReplies')
                  : t('chat.message.replies', { count: replies.length })}
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
                tools={tools[reply.id] ?? NO_TOOLS}
                startsGroup={startsGroup(reply, replies[index - 1])}
                replyCount={0}
                onRetry={onRetry}
                onStop={onStop}
                onDelete={onDelete}
                onOpenThread={null}
              />
            ))}
          </div>

          <Composer
            agents={agents}
            autoFocus
            placeholder={t('chat.composer.threadPlaceholder')}
            onSend={onSend}
          />
        </>
      )}
    </aside>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectAgent } from '@shared/types'
import { useAgentStore } from '../../store/agentStore'
import { useChatStore } from '../../store/chatStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Spinner } from '../../ui'
import { ChatIcon } from '../../ui/icons'
import { AgentBar } from './AgentBar'
import { Composer, type ComposerHandle } from './Composer'
import { MessageList } from './MessageList'
import { ThreadPanel } from './ThreadPanel'

export function ChatView() {
  const projectId = useUiStore((state) => state.activeProjectId)

  const messages = useChatStore((state) => state.messages)
  const tools = useChatStore((state) => state.tools)
  const activity = useChatStore((state) => state.activity)
  const loading = useChatStore((state) => state.loading)
  const storeError = useChatStore((state) => state.error)
  const threadRootId = useChatStore((state) => state.threadRootId)
  const threadMessages = useChatStore((state) => state.threadMessages)
  const threadLoading = useChatStore((state) => state.threadLoading)
  const threadError = useChatStore((state) => state.threadError)
  const loadChat = useChatStore((state) => state.load)
  const subscribeChat = useChatStore((state) => state.subscribe)
  const sendMessage = useChatStore((state) => state.send)
  const retryMessage = useChatStore((state) => state.retry)
  const stopMessage = useChatStore((state) => state.stop)
  const removeMessage = useChatStore((state) => state.remove)
  const openThread = useChatStore((state) => state.openThread)

  const agents = useAgentStore((state) => state.agents)
  const loadAgents = useAgentStore((state) => state.load)
  const subscribeAgents = useAgentStore((state) => state.subscribe)

  const composerRef = useRef<ComposerHandle>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [stopBusy, setStopBusy] = useState<Set<string>>(new Set())

  useEffect(() => {
    void loadChat(projectId)
    void loadAgents(projectId)
  }, [projectId, loadChat, loadAgents])

  useEffect(() => subscribeChat(), [subscribeChat])
  useEffect(() => subscribeAgents(), [subscribeAgents])

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  // Antworten hängen im Thread, nicht im Hauptverlauf — dort steht nur die Zahl darunter.
  const rootMessages = useMemo(
    () => messages.filter((message) => !message.replyToId),
    [messages],
  )

  const replyCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const message of messages) {
      if (message.replyToId) counts[message.replyToId] = (counts[message.replyToId] ?? 0) + 1
    }
    for (const reply of threadMessages) {
      if (!reply.replyToId || messages.some((message) => message.id === reply.id)) continue
      counts[reply.replyToId] = (counts[reply.replyToId] ?? 0) + 1
    }
    return counts
  }, [messages, threadMessages])

  const threadRoot = useMemo(
    () => messages.find((message) => message.id === threadRootId) ?? null,
    [messages, threadRootId],
  )

  const threadReplies = useMemo(
    () => threadMessages.filter((message) => message.id !== threadRootId),
    [threadMessages, threadRootId],
  )

  async function run(action: () => Promise<unknown>): Promise<void> {
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }

  async function toggleStopped(agent: ProjectAgent): Promise<void> {
    if (!projectId) return
    setStopBusy((current) => new Set(current).add(agent.id))
    await run(async () => {
      await window.api.agents.setStopped({
        projectId,
        agentId: agent.id,
        stopped: !agent.stopped,
      })
      await loadAgents(projectId)
    })
    setStopBusy((current) => {
      const next = new Set(current)
      next.delete(agent.id)
      return next
    })
  }

  function deleteMessage(messageId: string): void {
    if (!window.confirm('Diese Nachricht löschen?')) return
    void run(() => removeMessage(messageId))
  }

  if (!projectId) {
    return (
      <EmptyState
        title="Kein Projekt ausgewählt"
        description="Wähle links ein Projekt, um mit seinen Agenten zu sprechen."
        icon={<ChatIcon />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <AgentBar
          agents={agents}
          activity={activity}
          busyIds={stopBusy}
          onMention={(agent) => composerRef.current?.insertMention(agent.mentionKey)}
          onToggleStopped={(agent) => void toggleStopped(agent)}
        />

        {(storeError || actionError) && (
          <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : rootMessages.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              title={storeError ? 'Verlauf nicht verfügbar' : 'Noch keine Nachrichten'}
              description={
                storeError
                  ? 'Der Verlauf konnte nicht geladen werden.'
                  : 'Erwähne einen Agenten mit @ und stelle deine erste Frage.'
              }
              icon={<ChatIcon />}
              action={
                storeError ? (
                  <Button size="sm" onClick={() => void loadChat(projectId)}>
                    Erneut versuchen
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <MessageList
            messages={rootMessages}
            agents={agents}
            agentById={agentById}
            tools={tools}
            replyCounts={replyCounts}
            onRetry={(messageId) => void run(() => retryMessage(messageId))}
            onStop={(messageId) => void run(() => stopMessage(messageId))}
            onDelete={deleteMessage}
            onOpenThread={(messageId) => void openThread(messageId)}
          />
        )}

        <Composer
          ref={composerRef}
          agents={agents}
          placeholder="Nachricht an das Projekt — @ erwähnt einen Agenten"
          onSend={(input) =>
            sendMessage({
              content: input.content,
              mentions: input.mentions,
              attachmentIds: input.attachmentIds,
              replyToId: null,
            })
          }
        />
      </div>

      {threadRootId && (
        <ThreadPanel
          root={threadRoot}
          replies={threadReplies}
          agents={agents}
          agentById={agentById}
          tools={tools}
          loading={threadLoading}
          error={threadError}
          onClose={() => void openThread(null)}
          onRetry={(messageId) => void run(() => retryMessage(messageId))}
          onStop={(messageId) => void run(() => stopMessage(messageId))}
          onDelete={deleteMessage}
          onSend={(input) =>
            sendMessage({
              content: input.content,
              mentions: input.mentions,
              attachmentIds: input.attachmentIds,
              replyToId: threadRootId,
            })
          }
        />
      )}
    </div>
  )
}

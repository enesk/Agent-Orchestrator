import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectAgent } from '@shared/types'
import { useT } from '../../i18n'
import { useAgentStore } from '../../store/agentStore'
import { useChatStore } from '../../store/chatStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Spinner, useConfirm } from '../../ui'
import { AgentIcon, ChatIcon } from '../../ui/icons'
import { AgentBar } from './AgentBar'
import { CHAT_COLUMN } from './chatHelpers'
import { Composer, type ComposerHandle } from './Composer'
import { HistoryMenu, type ClearScope } from './HistoryMenu'
import { MessageList } from './MessageList'
import { ThreadPanel } from './ThreadPanel'

export function ChatView() {
  const t = useT()
  const projectId = useUiStore((state) => state.activeProjectId)

  const messages = useChatStore((state) => state.messages)
  const tools = useChatStore((state) => state.tools)
  const activity = useChatStore((state) => state.activity)
  const loading = useChatStore((state) => state.loading)
  const hasOlder = useChatStore((state) => state.hasOlder)
  const loadingOlder = useChatStore((state) => state.loadingOlder)
  const loadOlder = useChatStore((state) => state.loadOlder)
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
  const clearHistory = useChatStore((state) => state.clearHistory)
  const openThread = useChatStore((state) => state.openThread)

  const agents = useAgentStore((state) => state.agents)
  const agentsLoading = useAgentStore((state) => state.loading)
  const allAgents = useAgentStore((state) => state.allAgents)
  const loadAgents = useAgentStore((state) => state.load)
  const loadAllAgents = useAgentStore((state) => state.loadAll)
  const addToProject = useAgentStore((state) => state.addToProject)
  const subscribeAgents = useAgentStore((state) => state.subscribe)

  const openAgents = useUiStore((state) => state.openAgents)

  const composerRef = useRef<ComposerHandle>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [stopBusy, setStopBusy] = useState<Set<string>>(new Set())
  const [clearBusy, setClearBusy] = useState(false)
  const [clearNote, setClearNote] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    void loadChat(projectId)
    void loadAgents(projectId)
    void loadAllAgents()
  }, [projectId, loadChat, loadAgents, loadAllAgents])

  useEffect(() => subscribeChat(), [subscribeChat])
  useEffect(() => subscribeAgents(), [subscribeAgents])

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  // Global vorhandene, hier aber nicht zugeordnete Agenten — das @-Menü bietet sie mit an.
  const unassignedAgents = useMemo(
    () => allAgents.filter((agent) => !agents.some((assigned) => assigned.id === agent.id)),
    [allAgents, agents],
  )

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

  /**
   * Die Rückrufe unten hängen alle an `run` und müssen ihre Identität behalten: `MessageItem`
   * ist memoisiert und würde bei einer neuen Funktion je Renderdurchlauf trotzdem neu rendern.
   */
  const run = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }, [])

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

  const handleDelete = useCallback(
    (messageId: string): void => {
      void (async () => {
        const confirmed = await confirm({
          title: t('chat.delete.title'),
          message: t('chat.delete.message'),
          confirmLabel: t('common.delete'),
          danger: true,
        })
        if (!confirmed) return
        void run(() => removeMessage(messageId))
      })()
    },
    [confirm, run, removeMessage, t],
  )

  const handleRetry = useCallback(
    (messageId: string): void => void run(() => retryMessage(messageId)),
    [run, retryMessage],
  )

  const handleStop = useCallback(
    (messageId: string): void => void run(() => stopMessage(messageId)),
    [run, stopMessage],
  )

  const handleOpenThread = useCallback(
    (messageId: string): void => void openThread(messageId),
    [openThread],
  )

  const handleLoadOlder = useCallback((): void => void loadOlder(), [loadOlder])

  const scopeLabel = (scope: ClearScope): string =>
    scope === null ? t('chat.clear.scope.all') : t('chat.clear.scope.days', { days: scope })

  async function clearScope(scope: ClearScope): Promise<void> {
    if (!projectId) return
    setClearNote(null)
    setClearBusy(true)
    try {
      const { count } = await window.api.chat.countHistory({
        projectId,
        ...(scope === null ? {} : { olderThanDays: scope }),
      })
      if (count === 0) {
        setClearNote(t('chat.clear.nothing'))
        return
      }

      const confirmed = await confirm({
        title: t('chat.clear.title'),
        message: t('chat.clear.message', { count, scope: scopeLabel(scope) }),
        confirmLabel: t('common.delete'),
        danger: true,
      })
      if (!confirmed) return

      const deleted = await clearHistory(scope)
      setClearNote(t('chat.clear.done', { count: deleted }))
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setClearBusy(false)
    }
  }

  if (!projectId) {
    return (
      <EmptyState
        title={t('chat.noProject.title')}
        description={t('chat.noProject.description')}
        icon={<ChatIcon />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start gap-2 border-b border-line pr-3">
          <div className="min-w-0 flex-1">
            <AgentBar
              agents={agents}
              activity={activity}
              busyIds={stopBusy}
              onMention={(agent) => composerRef.current?.insertMention(agent.mentionKey)}
              onToggleStopped={(agent) => void toggleStopped(agent)}
            />
          </div>
          <div className="py-2">
            <HistoryMenu busy={clearBusy} onSelect={(scope) => void clearScope(scope)} />
          </div>
        </div>

        {clearNote && (
          <p className="shrink-0 border-b border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
            {clearNote}
          </p>
        )}

        {(storeError || actionError) && (
          <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : rootMessages.length === 0 && !storeError && !agentsLoading && agents.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              title={t('chat.noAgents.title')}
              description={t('chat.noAgents.description')}
              icon={<AgentIcon />}
              action={
                <Button variant="primary" onClick={() => openAgents('project')}>
                  {t('chat.noAgents.action')}
                </Button>
              }
            />
          </div>
        ) : rootMessages.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              title={storeError ? t('chat.unavailable.title') : t('chat.empty.title')}
              description={
                storeError ? t('chat.unavailable.description') : t('chat.empty.description')
              }
              icon={<ChatIcon />}
              action={
                storeError ? (
                  <Button size="sm" onClick={() => void loadChat(projectId)}>
                    {t('common.retry')}
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
            onRetry={handleRetry}
            onStop={handleStop}
            onDelete={handleDelete}
            onOpenThread={handleOpenThread}
            contentClassName={CHAT_COLUMN}
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            onLoadOlder={handleLoadOlder}
          />
        )}

        <Composer
          ref={composerRef}
          agents={agents}
          unassignedAgents={unassignedAgents}
          contentClassName={CHAT_COLUMN}
          onAssignAgent={(agent) => addToProject(projectId, agent.id)}
          placeholder={t('chat.composer.placeholder')}
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
          onRetry={handleRetry}
          onStop={handleStop}
          onDelete={handleDelete}
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
      {dialog}
    </div>
  )
}

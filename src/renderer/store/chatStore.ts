import { create } from 'zustand'
import type { AgentStatusUpdate, ChatMessage } from '@shared/types'
import { toErrorMessage } from './errorMessage'

/** Ein Werkzeugaufruf, wie ihn `chat.agentStatus` meldet — pro Nachricht gesammelt. */
export interface ToolEvent {
  id: string
  label: string
  done: boolean
}

export interface SendInput {
  content: string
  mentions: string[]
  attachmentIds: string[]
  replyToId: string | null
}

interface ChatState {
  projectId: string | null
  messages: ChatMessage[]
  loading: boolean
  error: string | null

  /** Letzter Statuswert je Agent, Schlüssel ist die Agent-ID. */
  activity: Record<string, AgentStatusUpdate>
  /** Werkzeugaufrufe je Nachricht, in der Reihenfolge ihres Auftretens. */
  tools: Record<string, ToolEvent[]>

  threadRootId: string | null
  threadMessages: ChatMessage[]
  threadLoading: boolean
  threadError: string | null

  load: (projectId: string | null) => Promise<void>
  send: (input: SendInput) => Promise<ChatMessage>
  retry: (messageId: string) => Promise<void>
  stop: (messageId: string) => Promise<void>
  remove: (messageId: string) => Promise<void>
  openThread: (messageId: string | null) => Promise<void>
  subscribe: () => () => void
}

const HISTORY_LIMIT = 300

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

/** Einzelne Nachricht einfügen oder ersetzen — der Verlauf wird nie komplett neu geladen. */
function upsert(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((item) => item.id === message.id)
  if (index === -1) return sortMessages([...messages, message])
  const next = [...messages]
  next[index] = message
  return next
}

function markToolsDone(tools: ToolEvent[]): ToolEvent[] {
  return tools.every((tool) => tool.done) ? tools : tools.map((tool) => ({ ...tool, done: true }))
}

/**
 * Werkzeug-Ereignisse werden aus dem Statusstrom aufgesammelt: Solange die Meldung
 * `tool` lautet, läuft der oberste Chip; jede andere Aktivität schließt ihn ab.
 */
function applyToolEvent(
  tools: Record<string, ToolEvent[]>,
  update: AgentStatusUpdate,
): Record<string, ToolEvent[]> {
  const messageId = update.messageId
  if (!messageId) return tools

  const current = tools[messageId] ?? []
  if (update.activity === 'tool' && update.detail) {
    const last = current[current.length - 1]
    if (last && !last.done && last.label === update.detail) return tools
    return {
      ...tools,
      [messageId]: [
        ...markToolsDone(current),
        { id: `${messageId}:${current.length}`, label: update.detail, done: false },
      ],
    }
  }

  if (current.length === 0) return tools
  const closed = markToolsDone(current)
  return closed === current ? tools : { ...tools, [messageId]: closed }
}

export const useChatStore = create<ChatState>((set, get) => ({
  projectId: null,
  messages: [],
  loading: false,
  error: null,
  activity: {},
  tools: {},
  threadRootId: null,
  threadMessages: [],
  threadLoading: false,
  threadError: null,

  load: async (projectId) => {
    set({
      projectId,
      loading: true,
      error: null,
      messages: [],
      activity: {},
      tools: {},
      threadRootId: null,
      threadMessages: [],
      threadError: null,
    })
    if (!projectId) {
      set({ loading: false })
      return
    }
    try {
      const messages = await window.api.chat.history({ projectId, limit: HISTORY_LIMIT })
      if (get().projectId !== projectId) return
      set({ messages: sortMessages(messages), loading: false })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ messages: [], loading: false, error: toErrorMessage(error) })
    }
  },

  send: async (input) => {
    const projectId = get().projectId
    if (!projectId) throw new Error('Kein Projekt ausgewählt')
    const message = await window.api.chat.send({
      projectId,
      content: input.content,
      mentions: input.mentions,
      attachmentIds: input.attachmentIds,
      replyToId: input.replyToId,
    })
    set((state) => ({
      messages: upsert(state.messages, message),
      threadMessages:
        state.threadRootId && message.replyToId === state.threadRootId
          ? upsert(state.threadMessages, message)
          : state.threadMessages,
      error: null,
    }))
    return message
  },

  retry: async (messageId) => {
    const message = await window.api.chat.retryMessage({ id: messageId })
    set((state) => ({
      messages: upsert(state.messages, message),
      tools: { ...state.tools, [message.id]: [] },
    }))
  },

  stop: async (messageId) => {
    await window.api.chat.stopMessage({ id: messageId })
  },

  remove: async (messageId) => {
    await window.api.chat.deleteMessage({ id: messageId })
    set((state) => {
      const tools = { ...state.tools }
      delete tools[messageId]
      return {
        messages: state.messages.filter((message) => message.id !== messageId),
        threadMessages: state.threadMessages.filter((message) => message.id !== messageId),
        threadRootId: state.threadRootId === messageId ? null : state.threadRootId,
        tools,
      }
    })
  },

  openThread: async (messageId) => {
    set({ threadRootId: messageId, threadMessages: [], threadError: null })
    if (!messageId) return
    set({ threadLoading: true })
    try {
      const replies = await window.api.chat.thread({ messageId })
      if (get().threadRootId !== messageId) return
      set({ threadMessages: sortMessages(replies), threadLoading: false })
    } catch (error) {
      if (get().threadRootId !== messageId) return
      set({ threadMessages: [], threadLoading: false, threadError: toErrorMessage(error) })
    }
  },

  subscribe: () => {
    const offMessage = window.api.on('chat.message', (payload) => {
      const state = get()
      if (payload.projectId !== state.projectId) return
      const message = payload.message
      const finished = message.status !== 'streaming'
      const existing = state.tools[message.id]
      set({
        messages: upsert(state.messages, message),
        threadMessages:
          state.threadRootId &&
          (message.replyToId === state.threadRootId || message.id === state.threadRootId)
            ? upsert(state.threadMessages, message)
            : state.threadMessages,
        tools:
          finished && existing && existing.length > 0
            ? { ...state.tools, [message.id]: markToolsDone(existing) }
            : state.tools,
      })
    })

    const offStatus = window.api.on('chat.agentStatus', (update) => {
      const state = get()
      if (update.projectId !== state.projectId) return
      set({
        activity: { ...state.activity, [update.agentId]: update },
        tools: applyToolEvent(state.tools, update),
      })
    })

    return () => {
      offMessage()
      offStatus()
    }
  },
}))

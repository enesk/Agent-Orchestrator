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
  /** Es liegen noch ältere Nachrichten in der Datenbank, die niemand geladen hat. */
  hasOlder: boolean
  loadingOlder: boolean

  /** Letzter Statuswert je Agent, Schlüssel ist die Agent-ID. */
  activity: Record<string, AgentStatusUpdate>
  /** Werkzeugaufrufe je Nachricht, in der Reihenfolge ihres Auftretens. */
  tools: Record<string, ToolEvent[]>

  threadRootId: string | null
  threadMessages: ChatMessage[]
  threadLoading: boolean
  threadError: string | null

  load: (projectId: string | null) => Promise<void>
  /** Holt die nächste Seite älterer Nachrichten und stellt sie voran. */
  loadOlder: () => Promise<void>
  send: (input: SendInput) => Promise<ChatMessage>
  retry: (messageId: string) => Promise<void>
  stop: (messageId: string) => Promise<void>
  remove: (messageId: string) => Promise<void>
  clearHistory: (olderThanDays: number | null) => Promise<number>
  openThread: (messageId: string | null) => Promise<void>
  subscribe: () => () => void
}

/** So viele Nachrichten hängen anfangs im Baum — der Rest kommt auf Knopfdruck. */
const PAGE_SIZE = 60

/**
 * Nur nach Zeitstempel, und `sort` ist stabil: Nachrichten aus derselben Millisekunde behalten
 * die Reihenfolge, in der sie ankamen. Ein Hinweis des Systems stand sonst über der Nachricht,
 * auf die er sich bezieht — der Zufall der UUID entschied.
 */
function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Einzelne Nachricht einfügen oder ersetzen — der Verlauf wird nie komplett neu geladen.
 *
 * Bewusst **ohne** Neusortierung: Während eines Streams trifft alle 60 ms dieselbe Nachricht
 * am Ende der Liste ein. Würde hier jedes Mal das ganze Array neu sortiert, bekäme jede
 * Nachricht eine neue Identität und die gesamte Liste renderte neu. Gesucht wird deshalb von
 * hinten, ersetzt wird an Ort und Stelle, und sortiert nur im Ausnahmefall einer Nachricht,
 * die zeitlich vor der letzten liegt.
 */
function upsert(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.id !== message.id) continue
    if (messages[index] === message) return messages
    const next = [...messages]
    next[index] = message
    return next
  }

  const last = messages[messages.length - 1]
  if (!last || last.createdAt <= message.createdAt) return [...messages, message]
  return sortMessages([...messages, message])
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
  hasOlder: false,
  loadingOlder: false,
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
      hasOlder: false,
      loadingOlder: false,
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
      const messages = await window.api.chat.history({ projectId, limit: PAGE_SIZE })
      if (get().projectId !== projectId) return
      set({
        messages: sortMessages(messages),
        loading: false,
        hasOlder: messages.length >= PAGE_SIZE,
      })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ messages: [], loading: false, error: toErrorMessage(error) })
    }
  },

  loadOlder: async () => {
    const { projectId, messages, hasOlder, loadingOlder } = get()
    const oldest = messages[0]
    if (!projectId || !oldest || !hasOlder || loadingOlder) return
    set({ loadingOlder: true })
    try {
      const older = await window.api.chat.history({
        projectId,
        limit: PAGE_SIZE,
        before: oldest.id,
      })
      if (get().projectId !== projectId) return
      // Zwischenzeitlich eingetroffene Nachrichten stehen schon in der Liste — nichts doppeln.
      const known = new Set(get().messages.map((message) => message.id))
      const fresh = older.filter((message) => !known.has(message.id))
      set({
        messages: [...sortMessages(fresh), ...get().messages],
        hasOlder: older.length >= PAGE_SIZE,
        loadingOlder: false,
      })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ loadingOlder: false, error: toErrorMessage(error) })
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

  clearHistory: async (olderThanDays) => {
    const projectId = get().projectId
    if (!projectId) return 0
    const { deleted } = await window.api.chat.clearHistory({
      projectId,
      ...(olderThanDays == null ? {} : { olderThanDays }),
    })
    // Neu geladen wird nicht hier, sondern auf `chat.historyCleared` — dasselbe Ereignis
    // erreicht auch eine Ansicht, die das Bereinigen nicht selbst ausgelöst hat.
    return deleted
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

    const offCleared = window.api.on('chat.historyCleared', (payload) => {
      if (payload.projectId !== get().projectId) return
      void get().load(payload.projectId)
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
      offCleared()
      offStatus()
    }
  },
}))

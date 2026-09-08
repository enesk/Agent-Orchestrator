import { create } from 'zustand'
import type { IpcRequest } from '@shared/ipc-contract'
import type { Ticket, TicketDetail, TicketStatus } from '@shared/types'
import { toErrorMessage } from './errorMessage'

/** Zusatzangaben für die Karten, die die Ticket-Liste selbst nicht mitliefert. */
export interface TicketMeta {
  comments: number
  dependencies: number
}

export interface TicketImportResult {
  created: number
  updated: number
  warnings: string[]
}

interface TicketState {
  projectId: string | null
  tickets: Ticket[]
  /** Kommentare, Abhängigkeiten und Anhänge des ausgewählten Tickets. */
  detail: TicketDetail | null
  meta: Record<string, TicketMeta>
  selectedId: string | null
  loading: boolean
  detailLoading: boolean
  error: string | null

  load: (projectId: string | null) => Promise<void>
  select: (ticketId: string | null) => Promise<void>
  create: (input: IpcRequest<'tickets', 'create'>) => Promise<Ticket>
  update: (id: string, patch: IpcRequest<'tickets', 'update'>['patch']) => Promise<Ticket>
  setStatus: (id: string, status: TicketStatus) => Promise<void>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<number>
  addComment: (ticketId: string, content: string) => Promise<void>
  setDependencies: (ticketId: string, dependsOn: string[]) => Promise<void>
  importJson: (projectId: string, json: string) => Promise<TicketImportResult>
  subscribe: () => () => void
}

function sortTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number)
}

function mergeTicket(tickets: Ticket[], ticket: Ticket): Ticket[] {
  const index = tickets.findIndex((item) => item.id === ticket.id)
  if (index === -1) return sortTickets([...tickets, ticket])
  const next = [...tickets]
  next[index] = ticket
  return sortTickets(next)
}

/** Der Detail-Datensatz erbt von `Ticket` — die Listeneinträge bleiben dieselbe Quelle. */
function toListEntry(detail: TicketDetail): Ticket {
  const { comments: _comments, dependencies: _d, dependents: _dp, attachments: _a, ...ticket } = detail
  return ticket
}

export const useTicketStore = create<TicketState>((set, get) => ({
  projectId: null,
  tickets: [],
  detail: null,
  meta: {},
  selectedId: null,
  loading: false,
  detailLoading: false,
  error: null,

  load: async (projectId) => {
    set({
      projectId,
      loading: true,
      error: null,
      tickets: [],
      detail: null,
      meta: {},
      selectedId: null,
    })
    if (!projectId) {
      set({ loading: false })
      return
    }
    try {
      const tickets = await window.api.tickets.list({ projectId })
      if (get().projectId !== projectId) return
      set({ tickets: sortTickets(tickets), loading: false })
      void loadMeta(projectId, tickets, set, get)
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ tickets: [], loading: false, error: toErrorMessage(error) })
    }
  },

  select: async (ticketId) => {
    set({ selectedId: ticketId, detail: null })
    if (!ticketId) return
    set({ detailLoading: true })
    try {
      const detail = await window.api.tickets.get({ id: ticketId })
      if (get().selectedId !== ticketId) return
      set({ detail, detailLoading: false })
      if (detail) {
        set({
          tickets: mergeTicket(get().tickets, toListEntry(detail)),
          meta: { ...get().meta, [detail.id]: metaOf(detail) },
        })
      }
    } catch (error) {
      if (get().selectedId !== ticketId) return
      set({ detail: null, detailLoading: false, error: toErrorMessage(error) })
    }
  },

  create: async (input) => {
    const ticket = await window.api.tickets.create(input)
    set({ tickets: mergeTicket(get().tickets, ticket), error: null })
    return ticket
  },

  update: async (id, patch) => {
    const ticket = await window.api.tickets.update({ id, patch })
    set({ tickets: mergeTicket(get().tickets, ticket), error: null })
    if (get().selectedId === id) {
      const detail = get().detail
      if (detail) set({ detail: { ...detail, ...ticket } })
    }
    return ticket
  },

  setStatus: async (id, status) => {
    await get().update(id, { status })
  },

  remove: async (id) => {
    await window.api.tickets.remove({ id })
    set((state) => dropTickets(state, [id]))
  },

  removeMany: async (ids) => {
    if (ids.length === 0) return 0
    const { removed } = await window.api.tickets.removeMany({ ids })
    set((state) => dropTickets(state, ids))
    return removed
  },

  addComment: async (ticketId, content) => {
    const comment = await window.api.tickets.addComment({ ticketId, content, authorType: 'user' })
    const detail = get().detail
    if (detail && detail.id === ticketId) {
      const next = { ...detail, comments: [...detail.comments, comment] }
      set({ detail: next, meta: { ...get().meta, [ticketId]: metaOf(next) } })
    }
  },

  setDependencies: async (ticketId, dependsOn) => {
    const detail = await window.api.tickets.setDependencies({ ticketId, dependsOn })
    set({
      tickets: mergeTicket(get().tickets, toListEntry(detail)),
      meta: { ...get().meta, [ticketId]: metaOf(detail) },
      error: null,
    })
    if (get().selectedId === ticketId) set({ detail })
  },

  importJson: async (projectId, json) => {
    const result = await window.api.tickets.importJson({ projectId, json })
    await get().load(projectId)
    return {
      created: result.created,
      updated: result.updated,
      warnings: readWarnings(result),
    }
  },

  subscribe: () =>
    window.api.on('ticket.changed', (payload) => {
      const state = get()
      if (payload.projectId !== state.projectId) return

      if (payload.action === 'removed') {
        set(dropTickets(state, payload.ticketIds ?? [payload.ticketId]))
        return
      }

      // Gezielt nachladen statt das Board neu aufzubauen — sonst flackert es, während
      // Agenten im Hintergrund arbeiten.
      void window.api.tickets
        .get({ id: payload.ticketId })
        .then((detail) => {
          if (!detail || get().projectId !== payload.projectId) return
          set({
            tickets: mergeTicket(get().tickets, toListEntry(detail)),
            meta: { ...get().meta, [detail.id]: metaOf(detail) },
          })
          if (get().selectedId === detail.id) set({ detail })
        })
        .catch(() => {
          /* Ein verlorenes Einzel-Update darf das Board nicht in den Fehlerzustand kippen. */
        })
    }),
}))

/**
 * Entfernt gelöschte Tickets inkrementell aus dem Zustand — die Liste wird nicht neu geladen,
 * damit das Board beim Sammellöschen nicht flackert. War eines davon im Detail-Panel offen,
 * schließt sich das Panel.
 */
function dropTickets(state: TicketState, ids: string[]): Partial<TicketState> {
  const removed = new Set(ids)
  const meta = { ...state.meta }
  for (const id of removed) delete meta[id]
  const hitSelection = state.selectedId !== null && removed.has(state.selectedId)
  return {
    tickets: state.tickets.filter((ticket) => !removed.has(ticket.id)),
    meta,
    detail: hitSelection ? null : state.detail,
    selectedId: hitSelection ? null : state.selectedId,
    error: null,
  }
}

function metaOf(detail: TicketDetail): TicketMeta {
  return { comments: detail.comments.length, dependencies: detail.dependencies.length }
}

/**
 * Kommentarzahl und Abhängigkeiten stehen nicht in der Listenantwort. Sie werden nach dem
 * Laden einmal nachgereicht, damit die Karten sie zeigen können.
 */
async function loadMeta(
  projectId: string,
  tickets: Ticket[],
  set: (partial: Partial<TicketState>) => void,
  get: () => TicketState,
): Promise<void> {
  const results = await Promise.allSettled(
    tickets.map((ticket) => window.api.tickets.get({ id: ticket.id })),
  )
  if (get().projectId !== projectId) return

  const meta: Record<string, TicketMeta> = { ...get().meta }
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue
    meta[result.value.id] = metaOf(result.value)
  }
  set({ meta })
}

/**
 * Der Import-Handler aus T4 liefert Warnungen mit; der Vertrag beschreibt bisher nur die
 * Zähler. Fehlen sie, bleibt die Liste leer.
 */
function readWarnings(result: unknown): string[] {
  const warnings = (result as { warnings?: unknown }).warnings
  if (!Array.isArray(warnings)) return []
  return warnings.map((warning) => String(warning))
}

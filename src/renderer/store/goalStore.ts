import { create } from 'zustand'
import type { IpcRequest } from '@shared/ipc-contract'
import type { Goal, GoalLogEntry } from '@shared/types'
import { toErrorMessage } from './errorMessage'

/** So viele Protokollzeilen werden beim Öffnen eines Vorhabens nachgeladen. */
const LOG_LIMIT = 500

interface GoalState {
  projectId: string | null
  goals: Goal[]
  selectedId: number | null
  /** Protokoll je Vorhaben, älteste Zeile zuerst. */
  logs: Record<number, GoalLogEntry[]>
  /** Tickets, die das Board für ein neues Vorhaben vorgemerkt hat. */
  draftTicketIds: string[]
  loading: boolean
  logLoading: boolean
  error: string | null
  logError: string | null

  load: (projectId: string | null) => Promise<void>
  select: (goalId: number | null) => Promise<void>
  startFromDescription: (input: IpcRequest<'goals', 'startFromDescription'>) => Promise<Goal>
  startFromTickets: (input: IpcRequest<'goals', 'startFromTickets'>) => Promise<Goal>
  cancel: (goalId: number) => Promise<void>
  retry: (goalId: number) => Promise<void>
  setDraftTickets: (ticketIds: string[]) => void
  subscribe: () => () => void
}

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
}

function mergeGoal(goals: Goal[], goal: Goal): Goal[] {
  const index = goals.findIndex((item) => item.id === goal.id)
  if (index === -1) return sortGoals([...goals, goal])
  const next = [...goals]
  next[index] = goal
  return sortGoals(next)
}

export const useGoalStore = create<GoalState>((set, get) => ({
  projectId: null,
  goals: [],
  selectedId: null,
  logs: {},
  draftTicketIds: [],
  loading: false,
  logLoading: false,
  error: null,
  logError: null,

  load: async (projectId) => {
    set({
      projectId,
      loading: true,
      error: null,
      goals: [],
      logs: {},
      selectedId: null,
      logError: null,
    })
    if (!projectId) {
      set({ loading: false })
      return
    }
    try {
      const goals = await window.api.goals.list({ projectId })
      if (get().projectId !== projectId) return
      set({ goals: sortGoals(goals), loading: false })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ goals: [], loading: false, error: toErrorMessage(error) })
    }
  },

  select: async (goalId) => {
    set({ selectedId: goalId, logError: null })
    if (goalId === null) return
    set({ logLoading: true })
    try {
      const entries = await window.api.goals.log({ goalId, limit: LOG_LIMIT })
      if (get().selectedId !== goalId) return
      set({ logs: { ...get().logs, [goalId]: sortLog(entries) }, logLoading: false })
    } catch (error) {
      if (get().selectedId !== goalId) return
      set({ logLoading: false, logError: toErrorMessage(error) })
    }
  },

  startFromDescription: async (input) => {
    const goal = await window.api.goals.startFromDescription(input)
    set({ goals: mergeGoal(get().goals, goal), error: null })
    await get().select(goal.id)
    return goal
  },

  startFromTickets: async (input) => {
    const goal = await window.api.goals.startFromTickets(input)
    set({ goals: mergeGoal(get().goals, goal), error: null, draftTicketIds: [] })
    await get().select(goal.id)
    return goal
  },

  cancel: async (goalId) => {
    const goal = await window.api.goals.cancel({ id: goalId })
    set({ goals: mergeGoal(get().goals, goal), error: null })
  },

  retry: async (goalId) => {
    const goal = await window.api.goals.retry({ id: goalId })
    set({ goals: mergeGoal(get().goals, goal), error: null })
    await get().select(goal.id)
  },

  setDraftTickets: (draftTicketIds) => set({ draftTicketIds }),

  subscribe: () => {
    const offChanged = window.api.on('goal.changed', (payload) => {
      const state = get()
      if (payload.projectId !== state.projectId) return

      if (payload.action === 'removed' || !payload.goal) {
        const logs = { ...state.logs }
        delete logs[payload.goalId]
        set({
          goals: state.goals.filter((goal) => goal.id !== payload.goalId),
          logs,
          selectedId: state.selectedId === payload.goalId ? null : state.selectedId,
        })
        return
      }

      set({ goals: mergeGoal(state.goals, payload.goal) })
    })

    const offLog = window.api.on('goal.log', (entry) => {
      const existing = get().logs[entry.goalId]
      // Nur mitschreiben, wo schon ein Protokoll geladen ist — sonst entstünden Lücken.
      if (!existing) return
      if (existing.some((item) => item.id === entry.id)) return
      set({ logs: { ...get().logs, [entry.goalId]: [...existing, entry] } })
    })

    return () => {
      offChanged()
      offLog()
    }
  },
}))

function sortLog(entries: GoalLogEntry[]): GoalLogEntry[] {
  return [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}

export function useSelectedGoal(): Goal | null {
  const goals = useGoalStore((state) => state.goals)
  const selectedId = useGoalStore((state) => state.selectedId)
  return goals.find((goal) => goal.id === selectedId) ?? null
}

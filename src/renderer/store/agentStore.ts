import { create } from 'zustand'
import type { IpcRequest } from '@shared/ipc-contract'
import type { Agent, ProjectAgent } from '@shared/types'
import { toErrorMessage } from './errorMessage'

interface AgentState {
  projectId: string | null
  /** Die Agenten des aktiven Projekts — lesend gebraucht von Tickets, Dokumenten, Chat. */
  agents: ProjectAgent[]
  /** Alle global angelegten Agenten, unabhängig von der Projektzuordnung. */
  allAgents: ProjectAgent[]
  loading: boolean
  allLoading: boolean
  error: string | null

  load: (projectId: string | null) => Promise<void>
  loadAll: () => Promise<void>
  create: (input: IpcRequest<'agents', 'create'>) => Promise<Agent>
  update: (id: string, patch: IpcRequest<'agents', 'update'>['patch']) => Promise<Agent>
  remove: (id: string) => Promise<void>
  addToProject: (projectId: string, agentId: string) => Promise<void>
  /** Ordnet mehrere Agenten in der übergebenen Reihenfolge zu — für den Projekt-Anlagedialog. */
  addManyToProject: (projectId: string, agentIds: string[]) => Promise<void>
  removeFromProject: (projectId: string, agentId: string) => Promise<void>
  setStopped: (projectId: string, agentId: string, stopped: boolean) => Promise<void>
  /** Verschiebt einen Agenten in der Projektreihenfolge um eine Position. */
  move: (projectId: string, agentId: string, direction: -1 | 1) => Promise<void>
  subscribe: () => () => void
}

/**
 * Der Store hält zwei Listen: die Agenten des aktiven Projekts und alle globalen Agenten.
 * Beide hängen am Ereignis `agent.changed`, weil Agenten auch von Werkzeugen und vom
 * Goal-Loop verändert werden.
 */
export const useAgentStore = create<AgentState>((set, get) => ({
  projectId: null,
  agents: [],
  allAgents: [],
  loading: false,
  allLoading: false,
  error: null,

  load: async (projectId) => {
    set({ projectId, loading: true, error: null })
    try {
      const agents = await window.api.agents.list({ projectId })
      if (get().projectId !== projectId) return
      set({ agents, loading: false })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ agents: [], loading: false, error: toErrorMessage(error) })
    }
  },

  loadAll: async () => {
    set({ allLoading: true, error: null })
    try {
      const allAgents = await window.api.agents.list({ projectId: null })
      set({ allAgents, allLoading: false })
    } catch (error) {
      set({ allAgents: [], allLoading: false, error: toErrorMessage(error) })
    }
  },

  create: async (input) => {
    const agent = await window.api.agents.create(input)
    await get().loadAll()
    return agent
  },

  update: async (id, patch) => {
    const agent = await window.api.agents.update({ id, patch })
    await get().loadAll()
    if (get().projectId) await get().load(get().projectId)
    return agent
  },

  remove: async (id) => {
    await window.api.agents.remove({ id })
    await get().loadAll()
    if (get().projectId) await get().load(get().projectId)
  },

  addToProject: async (projectId, agentId) => {
    await window.api.agents.addToProject({ projectId, agentId })
    await get().load(projectId)
  },

  addManyToProject: async (projectId, agentIds) => {
    for (const [sortOrder, agentId] of agentIds.entries()) {
      await window.api.agents.addToProject({ projectId, agentId, sortOrder })
    }
    if (get().projectId === projectId) await get().load(projectId)
  },

  removeFromProject: async (projectId, agentId) => {
    await window.api.agents.removeFromProject({ projectId, agentId })
    await get().load(projectId)
  },

  setStopped: async (projectId, agentId, stopped) => {
    await window.api.agents.setStopped({ projectId, agentId, stopped })
    await get().load(projectId)
  },

  move: async (projectId, agentId, direction) => {
    const ordered = get().agents
    const index = ordered.findIndex((agent) => agent.id === agentId)
    const target = index + direction
    if (index === -1 || target < 0 || target >= ordered.length) return

    const next = [...ordered]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved!)

    // `addToProject` ist zugleich das Upsert für die Sortierung.
    for (const [position, agent] of next.entries()) {
      await window.api.agents.addToProject({ projectId, agentId: agent.id, sortOrder: position })
    }
    await get().load(projectId)
  },

  subscribe: () =>
    window.api.on('agent.changed', () => {
      void get().load(get().projectId)
      void get().loadAll()
    }),
}))

export function useAgentLookup(): Map<string, ProjectAgent> {
  const agents = useAgentStore((state) => state.agents)
  return new Map(agents.map((agent) => [agent.id, agent]))
}

import { create } from 'zustand'
import type { ProjectAgent } from '@shared/types'
import { toErrorMessage } from './errorMessage'

interface AgentState {
  projectId: string | null
  agents: ProjectAgent[]
  loading: boolean
  error: string | null
  load: (projectId: string | null) => Promise<void>
  subscribe: () => () => void
}

/**
 * Die Agentenliste wird von Tickets und Dokumenten nur lesend gebraucht (Name, Farbe).
 * Sie hält deshalb keinen eigenen Bearbeitungszustand.
 */
export const useAgentStore = create<AgentState>((set, get) => ({
  projectId: null,
  agents: [],
  loading: false,
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

  subscribe: () =>
    window.api.on('agent.changed', () => {
      void get().load(get().projectId)
    }),
}))

export function useAgentLookup(): Map<string, ProjectAgent> {
  const agents = useAgentStore((state) => state.agents)
  return new Map(agents.map((agent) => [agent.id, agent]))
}

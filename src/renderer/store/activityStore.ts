import { create } from 'zustand'
import type { AgentActivity } from '@shared/types'

/** Diese Zustände bedeuten „der Agent arbeitet gerade"; `idle` und `error` beenden einen Lauf. */
const BUSY: readonly AgentActivity[] = ['thinking', 'writing', 'tool']

interface ActivityState {
  /** Je Projekt die IDs der Agenten, die gerade laufen. */
  busyAgentIds: Record<string, string[]>
  /**
   * Hört den Statusstrom für **alle** Projekte mit — der Chat-Store filtert auf das offene
   * Projekt, die Projektliste braucht dagegen jedes.
   */
  subscribe: () => () => void
}

function withAgent(current: string[], agentId: string, busy: boolean): string[] {
  const has = current.includes(agentId)
  if (busy === has) return current
  return busy ? [...current, agentId] : current.filter((id) => id !== agentId)
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  busyAgentIds: {},

  subscribe: () =>
    window.api.on('chat.agentStatus', (update) => {
      const current = get().busyAgentIds[update.projectId] ?? []
      const next = withAgent(current, update.agentId, BUSY.includes(update.activity))
      if (next === current) return
      set({ busyAgentIds: { ...get().busyAgentIds, [update.projectId]: next } })
    }),
}))

/** Läuft im Projekt gerade mindestens ein Agent? */
export function useProjectBusy(projectId: string): boolean {
  return useActivityStore((state) => (state.busyAgentIds[projectId] ?? []).length > 0)
}

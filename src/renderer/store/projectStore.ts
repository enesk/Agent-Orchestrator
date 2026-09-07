import { create } from 'zustand'
import type { Project } from '@shared/types'
import { useUiStore } from './uiStore'

interface ProjectState {
  projects: Project[]
  loading: boolean
  error: string | null
  load: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await window.api.projects.list()
      set({ projects, loading: false })

      // Erstes Projekt vorauswählen, solange noch keins aktiv ist.
      const { activeProjectId, setActiveProject } = useUiStore.getState()
      if (!activeProjectId && projects.length > 0) setActiveProject(projects[0]!.id)
    } catch (error) {
      set({ projects: [], loading: false, error: toMessage(error) })
    }
  },
}))

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useActiveProject(): Project | null {
  const activeProjectId = useUiStore((state) => state.activeProjectId)
  const projects = useProjectStore((state) => state.projects)
  return projects.find((project) => project.id === activeProjectId) ?? null
}

import { create } from 'zustand'
import { activeT } from '../i18n/active'
import type { IpcRequest, IpcResponse } from '@shared/ipc-contract'
import type { Project } from '@shared/types'
import { toErrorMessage } from './errorMessage'
import { useUiStore } from './uiStore'

type ProjectSaveResult = IpcResponse<'projects', 'create'>

interface ProjectState {
  projects: Project[]
  loading: boolean
  error: string | null
  /** Hinweis zum Projektpfad je Projekt, wie ihn `projects.create`/`update` mitliefert. */
  pathWarnings: Record<string, string | null>

  load: () => Promise<void>
  create: (input: IpcRequest<'projects', 'create'>) => Promise<ProjectSaveResult>
  update: (
    id: string,
    patch: IpcRequest<'projects', 'update'>['patch'],
  ) => Promise<ProjectSaveResult>
  remove: (id: string) => Promise<void>
}

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, activeT().locale))
}

function mergeProject(projects: Project[], project: Project): Project[] {
  const index = projects.findIndex((item) => item.id === project.id)
  if (index === -1) return sortProjects([...projects, project])
  const next = [...projects]
  next[index] = project
  return sortProjects(next)
}

/** Das Ergebnis der Speicher-Aufrufe trägt den Pfadhinweis; das Projekt selbst nicht. */
function toProject(result: ProjectSaveResult): Project {
  const { pathWarning: _pathWarning, ...project } = result
  return project
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  pathWarnings: {},

  load: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await window.api.projects.list()
      set({ projects, loading: false })

      // Erstes Projekt vorauswählen, solange noch keins aktiv ist.
      const { activeProjectId, setActiveProject } = useUiStore.getState()
      if (!activeProjectId && projects.length > 0) setActiveProject(projects[0]!.id)
    } catch (error) {
      set({ projects: [], loading: false, error: toErrorMessage(error) })
    }
  },

  create: async (input) => {
    const result = await window.api.projects.create(input)
    set({
      projects: mergeProject(get().projects, toProject(result)),
      pathWarnings: { ...get().pathWarnings, [result.id]: result.pathWarning },
      error: null,
    })
    return result
  },

  update: async (id, patch) => {
    const result = await window.api.projects.update({ id, patch })
    set({
      projects: mergeProject(get().projects, toProject(result)),
      pathWarnings: { ...get().pathWarnings, [result.id]: result.pathWarning },
      error: null,
    })
    return result
  },

  remove: async (id) => {
    await window.api.projects.remove({ id })
    const projects = get().projects.filter((project) => project.id !== id)
    const pathWarnings = { ...get().pathWarnings }
    delete pathWarnings[id]
    set({ projects, pathWarnings, error: null })

    const { activeProjectId, setActiveProject } = useUiStore.getState()
    if (activeProjectId === id) setActiveProject(projects[0]?.id ?? null)
  },
}))

export function useActiveProject(): Project | null {
  const activeProjectId = useUiStore((state) => state.activeProjectId)
  const projects = useProjectStore((state) => state.projects)
  return projects.find((project) => project.id === activeProjectId) ?? null
}

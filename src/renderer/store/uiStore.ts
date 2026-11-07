import { create } from 'zustand'
import type { TranslationKey } from '@shared/i18n'

export type Section = 'home' | 'chat' | 'tickets' | 'documents' | 'goals' | 'agents' | 'settings'

export const SECTION_LABEL_KEYS: Record<Section, TranslationKey> = {
  home: 'nav.home',
  chat: 'nav.chat',
  tickets: 'nav.tickets',
  documents: 'nav.documents',
  goals: 'nav.goals',
  agents: 'nav.agents',
  settings: 'nav.settings',
}

/** Spalten, nach denen die Projektliste sortiert werden kann. */
export type ProjectSortKey = 'name' | 'open' | 'activity'

export interface ProjectSort {
  key: ProjectSortKey
  direction: 'asc' | 'desc'
}

/** Reiter des Agenten-Bereichs — im Store, damit andere Ansichten gezielt dorthin führen. */
export type AgentsTab = 'editor' | 'project' | 'memory' | 'skills' | 'mcp'

interface UiState {
  activeProjectId: string | null
  activeSection: Section
  agentsTab: AgentsTab
  logBarOpen: boolean
  /** Sortierung der Projektliste — bleibt über Ansichtswechsel hinweg stehen. */
  projectSort: ProjectSort
  /** Seitenleiste mit Beschriftungen statt nur Symbolen — startet ausgeklappt. */
  navExpanded: boolean
  setActiveProject: (projectId: string | null) => void
  setActiveSection: (section: Section) => void
  setAgentsTab: (tab: AgentsTab) => void
  /** Dieselbe Spalte nochmal dreht die Richtung, eine neue beginnt absteigend. */
  sortProjects: (key: ProjectSortKey) => void
  /** Springt in den Agenten-Bereich und öffnet dort den gewünschten Reiter. */
  openAgents: (tab: AgentsTab) => void
  setLogBarOpen: (open: boolean) => void
  toggleLogBar: () => void
  setNavExpanded: (expanded: boolean) => void
  toggleNavExpanded: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  activeSection: 'home',
  agentsTab: 'editor',
  logBarOpen: false,
  projectSort: { key: 'activity', direction: 'desc' },
  navExpanded: true,
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setAgentsTab: (agentsTab) => set({ agentsTab }),
  sortProjects: (key) =>
    set((state) => ({
      projectSort:
        state.projectSort.key === key
          ? { key, direction: state.projectSort.direction === 'desc' ? 'asc' : 'desc' }
          : { key, direction: 'desc' },
    })),
  openAgents: (agentsTab) => set({ activeSection: 'agents', agentsTab }),
  setLogBarOpen: (logBarOpen) => set({ logBarOpen }),
  toggleLogBar: () => set((state) => ({ logBarOpen: !state.logBarOpen })),
  setNavExpanded: (navExpanded) => set({ navExpanded }),
  toggleNavExpanded: () => set((state) => ({ navExpanded: !state.navExpanded })),
}))

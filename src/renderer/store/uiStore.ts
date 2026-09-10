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

/** Reiter des Agenten-Bereichs — im Store, damit andere Ansichten gezielt dorthin führen. */
export type AgentsTab = 'editor' | 'project' | 'memory'

interface UiState {
  activeProjectId: string | null
  activeSection: Section
  agentsTab: AgentsTab
  logBarOpen: boolean
  setActiveProject: (projectId: string | null) => void
  setActiveSection: (section: Section) => void
  setAgentsTab: (tab: AgentsTab) => void
  /** Springt in den Agenten-Bereich und öffnet dort den gewünschten Reiter. */
  openAgents: (tab: AgentsTab) => void
  setLogBarOpen: (open: boolean) => void
  toggleLogBar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  activeSection: 'home',
  agentsTab: 'editor',
  logBarOpen: false,
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setAgentsTab: (agentsTab) => set({ agentsTab }),
  openAgents: (agentsTab) => set({ activeSection: 'agents', agentsTab }),
  setLogBarOpen: (logBarOpen) => set({ logBarOpen }),
  toggleLogBar: () => set((state) => ({ logBarOpen: !state.logBarOpen })),
}))

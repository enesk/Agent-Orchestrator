import { create } from 'zustand'

export type Section = 'home' | 'chat' | 'tickets' | 'documents' | 'goals' | 'agents' | 'settings'

export const SECTION_LABELS: Record<Section, string> = {
  home: 'Übersicht',
  chat: 'Chat',
  tickets: 'Tickets',
  documents: 'Dokumente',
  goals: 'Vorhaben',
  agents: 'Agenten',
  settings: 'Einstellungen',
}

interface UiState {
  activeProjectId: string | null
  activeSection: Section
  panelOpen: boolean
  setActiveProject: (projectId: string | null) => void
  setActiveSection: (section: Section) => void
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  activeSection: 'home',
  panelOpen: false,
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
}))

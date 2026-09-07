import { create } from 'zustand'
import type { AppSettings } from '@shared/types'

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  save: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null })
    try {
      set({ settings: await window.api.settings.get(), loading: false })
    } catch (error) {
      set({ loading: false, error: toMessage(error) })
    }
  },
  save: async (patch) => {
    // Optimistisch anwenden, damit Schalter nicht zurückspringen; der Main-Prozess korrigiert.
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...patch } : state.settings,
      error: null,
    }))
    try {
      set({ settings: await window.api.settings.save(patch) })
    } catch (error) {
      set({ error: toMessage(error) })
      try {
        set({ settings: await window.api.settings.get() })
      } catch {
        // Wenn schon das Lesen scheitert, bleibt die Fehlermeldung oben stehen.
      }
    }
  },
}))

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

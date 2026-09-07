import { create } from 'zustand'
import type { ClaudeStatus } from '@shared/types'

interface ClaudeState {
  status: ClaudeStatus | null
  error: string | null
  load: () => Promise<void>
  set: (status: ClaudeStatus) => void
}

export const useClaudeStore = create<ClaudeState>((set) => ({
  status: null,
  error: null,
  load: async () => {
    try {
      set({ status: await window.api.claude.status(), error: null })
    } catch (error) {
      set({ status: null, error: error instanceof Error ? error.message : String(error) })
    }
  },
  set: (status) => set({ status, error: null }),
}))

import { create } from 'zustand'
import type { ActiveRun } from '@shared/types'
import { toErrorMessage } from './errorMessage'

interface RunState {
  /** Die laufenden Läufe, älteste zuerst — so wandern neue Zeilen unten an. */
  runs: ActiveRun[]
  loading: boolean
  error: string | null

  /** Einmal der Anfangsstand; alles danach kommt über `subscribe`. */
  load: () => Promise<void>
  subscribe: () => () => void
}

function sortRuns(runs: ActiveRun[]): ActiveRun[] {
  return [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
}

/**
 * Der Anfangsstand wird nicht eingesetzt, sondern eingemischt: die Zuhörer hängen schon dran,
 * bevor er geholt wird, und ein Lauf, der in der Zwischenzeit begonnen hat, dürfte nicht
 * wieder verschwinden. Ein beendeter Lauf nimmt umgekehrt sein eigenes Ereignis mit sich.
 */
function merge(current: ActiveRun[], snapshot: ActiveRun[]): ActiveRun[] {
  const known = new Map(current.map((run) => [run.id, run]))
  const merged = snapshot.map((run) => {
    const local = known.get(run.id)
    known.delete(run.id)
    // Der lokale Werkzeugzustand kann jünger sein als der Abzug aus dem Main-Prozess.
    if (!local || local.toolSince <= run.toolSince) return run
    return { ...run, tool: local.tool, toolSince: local.toolSince }
  })
  return [...merged, ...known.values()]
}

export const useRunStore = create<RunState>((set, get) => ({
  runs: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true })
    try {
      const snapshot = await window.api.runs.list()
      set({ runs: sortRuns(merge(get().runs, snapshot)), loading: false, error: null })
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) })
    }
  },

  /**
   * Fortgeschrieben wird ausschließlich über Ereignisse — derselbe Weg, der die
   * Live-Anzeige der Vorhaben-Seite speist. Gepollt wird hier nichts.
   */
  subscribe: () => {
    const offStarted = window.api.on('run.started', (run) => {
      const runs = get().runs
      if (runs.some((entry) => entry.id === run.id)) return
      set({ runs: sortRuns([...runs, run]) })
    })

    const offActivity = window.api.on('run.activity', ({ id, tool, since }) => {
      const runs = get().runs
      const index = runs.findIndex((entry) => entry.id === id)
      if (index === -1) return
      const next = [...runs]
      next[index] = { ...next[index]!, tool, toolSince: since }
      set({ runs: next })
    })

    const offFinished = window.api.on('run.finished', ({ id }) => {
      const runs = get().runs
      if (!runs.some((entry) => entry.id === id)) return
      set({ runs: runs.filter((entry) => entry.id !== id) })
    })

    return () => {
      offStarted()
      offActivity()
      offFinished()
    }
  },
}))

import { create } from 'zustand'
import type { AgentQuestion, QuestionStatus } from '@shared/types'
import { toErrorMessage } from './errorMessage'

/**
 * Die Rückfragen der Agenten. Der Zähler läuft **projektübergreifend**: eine Frage, die in
 * einem anderen Projekt wartet, soll nicht unsichtbar sein, nur weil gerade ein anderes
 * Projekt offen ist.
 */
interface QuestionState {
  questions: AgentQuestion[]
  /** `null` heißt: alle Zustände. Startwert ist „nur offene". */
  filter: QuestionStatus | null
  /** `null` heißt: alle Projekte. */
  projectId: string | null
  openCount: number
  loading: boolean
  error: string | null

  load: () => Promise<void>
  setFilter: (filter: QuestionStatus | null) => Promise<void>
  setProject: (projectId: string | null) => Promise<void>
  answer: (id: string, answer: string) => Promise<void>
  discard: (id: string) => Promise<void>
  /** Zähler und Liste aktuell halten — einmal beim Start der App aufgerufen. */
  subscribe: () => () => void
}

function sortQuestions(questions: AgentQuestion[]): AgentQuestion[] {
  return [...questions].sort((a, b) => b.askedAt.localeCompare(a.askedAt))
}

export const useQuestionStore = create<QuestionState>((set, get) => ({
  questions: [],
  filter: 'open',
  projectId: null,
  openCount: 0,
  loading: false,
  error: null,

  load: async () => {
    const { filter, projectId } = get()
    set({ loading: true, error: null })
    try {
      const [questions, { count }] = await Promise.all([
        window.api.questions.list({ projectId, status: filter }),
        window.api.questions.openCount({}),
      ])
      // Zwischenzeitlich umgestellte Filter machen diese Antwort wertlos.
      if (get().filter !== filter || get().projectId !== projectId) return
      set({ questions: sortQuestions(questions), openCount: count, loading: false })
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) })
    }
  },

  setFilter: async (filter) => {
    set({ filter })
    await get().load()
  },

  setProject: async (projectId) => {
    set({ projectId })
    await get().load()
  },

  answer: async (id, answer) => {
    const updated = await window.api.questions.answer({ id, answer })
    apply(set, get, updated)
  },

  discard: async (id) => {
    const updated = await window.api.questions.discard({ id })
    apply(set, get, updated)
  },

  subscribe: () =>
    window.api.on('question.changed', (payload) => {
      set({ openCount: payload.openCount })
      apply(set, get, payload.question)
    }),
}))

/**
 * Eine geänderte Frage einsortieren — oder aus der Liste nehmen, wenn sie nicht mehr zum
 * Filter passt. Eine beantwortete Frage verschwindet so aus der Ansicht „Offen", ohne dass
 * neu geladen werden muss.
 */
function apply(
  set: (partial: Partial<QuestionState>) => void,
  get: () => QuestionState,
  question: AgentQuestion,
): void {
  const state = get()
  const fitsProject = state.projectId === null || state.projectId === question.projectId
  const fitsFilter = state.filter === null || state.filter === question.status

  const rest = state.questions.filter((entry) => entry.id !== question.id)
  set({
    questions: fitsProject && fitsFilter ? sortQuestions([...rest, question]) : rest,
    error: null,
  })
}

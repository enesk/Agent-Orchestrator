import { create } from 'zustand'
import type { ProjectDocument } from '@shared/types'
import { toErrorMessage } from './errorMessage'

interface DocumentState {
  projectId: string | null
  documents: ProjectDocument[]
  selectedId: string | null
  loading: boolean
  error: string | null

  load: (projectId: string | null) => Promise<void>
  select: (documentId: string | null) => void
  create: (projectId: string, title: string) => Promise<ProjectDocument>
  update: (id: string, patch: { title?: string; content?: string }) => Promise<ProjectDocument>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

function sortDocuments(documents: ProjectDocument[]): ProjectDocument[] {
  return [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function mergeDocument(
  documents: ProjectDocument[],
  document: ProjectDocument,
): ProjectDocument[] {
  const index = documents.findIndex((item) => item.id === document.id)
  if (index === -1) return sortDocuments([...documents, document])
  const next = [...documents]
  next[index] = document
  return sortDocuments(next)
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  projectId: null,
  documents: [],
  selectedId: null,
  loading: false,
  error: null,

  load: async (projectId) => {
    // `selectedId` bleibt stehen: andere Bereiche wählen ein Dokument vor dem Wechsel aus.
    set({ projectId, loading: true, error: null, documents: [] })
    if (!projectId) {
      set({ loading: false, selectedId: null })
      return
    }
    try {
      const documents = await window.api.documents.list({ projectId })
      if (get().projectId !== projectId) return
      const selectedId = get().selectedId
      set({
        documents: sortDocuments(documents),
        loading: false,
        selectedId: documents.some((document) => document.id === selectedId) ? selectedId : null,
      })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ documents: [], loading: false, selectedId: null, error: toErrorMessage(error) })
    }
  },

  select: (selectedId) => set({ selectedId }),

  create: async (projectId, title) => {
    const document = await window.api.documents.create({ projectId, title, content: '' })
    set({
      documents: mergeDocument(get().documents, document),
      selectedId: document.id,
      error: null,
    })
    return document
  },

  update: async (id, patch) => {
    const document = await window.api.documents.update({ id, patch })
    set({ documents: mergeDocument(get().documents, document), error: null })
    return document
  },

  remove: async (id) => {
    await window.api.documents.remove({ id })
    set((state) => ({
      documents: state.documents.filter((document) => document.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      error: null,
    }))
  },

  subscribe: () =>
    window.api.on('document.changed', (payload) => {
      const state = get()
      if (payload.projectId !== state.projectId) return

      if (payload.action === 'removed') {
        set({
          documents: state.documents.filter((document) => document.id !== payload.documentId),
          selectedId: state.selectedId === payload.documentId ? null : state.selectedId,
        })
        return
      }

      void window.api.documents
        .get({ id: payload.documentId })
        .then((document) => {
          if (!document || get().projectId !== payload.projectId) return
          set({ documents: mergeDocument(get().documents, document) })
        })
        .catch(() => {
          /* Einzelne verlorene Aktualisierungen bleiben ohne Fehlermeldung. */
        })
    }),
}))

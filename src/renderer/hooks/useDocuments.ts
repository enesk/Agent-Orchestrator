import { useState, useEffect, useCallback } from 'react'
import { useIpc } from './useIpc'
import type { ProjectDocument } from '@shared/types'

export function useDocuments(projectId: string | null) {
  const ipc = useIpc()
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(false)

  // Load documents when project changes
  useEffect(() => {
    if (!projectId) {
      setDocuments([])
      return
    }
    setLoading(true)
    ipc.documents.getAll(projectId)
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  // Reload after full sync
  useEffect(() => {
    const unsub = ipc.onSyncStatusUpdate((data: { type: string }) => {
      if (data.type === 'full-sync-completed' && projectId) {
        ipc.documents.getAll(projectId).then(setDocuments).catch(() => {})
      }
    })
    return () => unsub()
  }, [projectId])

  // Listen for real-time document updates
  useEffect(() => {
    const unsub = ipc.documents.onUpdate((data) => {
      if (data.type === 'created' && data.document) {
        setDocuments((prev) => [data.document!, ...prev])
      } else if (data.type === 'updated' && data.document) {
        const doc = data.document
        setDocuments((prev) => prev.map((d) => d.id === doc!.id ? doc! : d))
      } else if (data.type === 'deleted' && data.documentId) {
        const id = data.documentId
        setDocuments((prev) => prev.filter((d) => d.id !== id))
      }
    })
    return unsub
  }, [])

  const createDocument = useCallback(async (title: string, content: string) => {
    if (!projectId) return
    const doc = await ipc.documents.create(projectId, title, content)
    return doc
  }, [ipc, projectId])

  const updateDocument = useCallback(async (documentId: string, updates: { title?: string; content?: string }) => {
    const doc = await ipc.documents.update(documentId, updates)
    return doc
  }, [ipc])

  const deleteDocument = useCallback(async (documentId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== documentId))
    await ipc.documents.delete(documentId)
  }, [ipc])

  return {
    documents,
    loading,
    createDocument,
    updateDocument,
    deleteDocument,
  }
}

import { useState, useEffect, useCallback } from 'react'
import { useIpc } from './useIpc'
import type { Ticket, TicketComment, TicketGroups, TicketCategory, MessageAttachment } from '@shared/types'
import type { ImportResult } from '@shared/ticketImport'

export function useTickets(projectId: string | null) {
  const ipc = useIpc()
  const [tickets, setTickets] = useState<TicketGroups>({ open: [], in_progress: [], done: [] })
  const [loading, setLoading] = useState(false)

  // Load tickets when project changes
  useEffect(() => {
    if (!projectId) {
      setTickets({ open: [], in_progress: [], done: [] })
      return
    }
    setLoading(true)
    ipc.tickets.getAll(projectId)
      .then(setTickets)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  // Reload tickets after full sync
  useEffect(() => {
    const unsub = ipc.onSyncStatusUpdate((data: { type: string }) => {
      if (data.type === 'full-sync-completed' && projectId) {
        ipc.tickets.getAll(projectId).then(setTickets).catch(() => {})
      }
    })
    return () => unsub()
  }, [projectId])

  // Listen for real-time ticket updates
  useEffect(() => {
    const unsub = ipc.tickets.onUpdate((data) => {
      if (data.type === 'created' && data.ticket) {
        const ticket = data.ticket
        setTickets((prev) => ({
          ...prev,
          [ticket.status]: [...prev[ticket.status], ticket],
        }))
      } else if (data.type === 'updated' && data.ticket) {
        const ticket = data.ticket
        setTickets((prev) => {
          // Remove from all columns
          const cleaned: TicketGroups = {
            open: prev.open.filter((t) => t.id !== ticket.id),
            in_progress: prev.in_progress.filter((t) => t.id !== ticket.id),
            done: prev.done.filter((t) => t.id !== ticket.id),
          }
          // Add to correct column
          cleaned[ticket.status] = [...cleaned[ticket.status], ticket]
          return cleaned
        })
      } else if (data.type === 'deleted' && data.ticketId) {
        const id = data.ticketId
        setTickets((prev) => ({
          open: prev.open.filter((t) => t.id !== id),
          in_progress: prev.in_progress.filter((t) => t.id !== id),
          done: prev.done.filter((t) => t.id !== id),
        }))
      } else if (data.type === 'comment-added' && data.ticketId && data.comment) {
        const { ticketId, comment } = data
        const addComment = (list: Ticket[]) =>
          list.map((t) => t.id === ticketId ? { ...t, comments: [...t.comments, comment] } : t)
        setTickets((prev) => ({
          open: addComment(prev.open),
          in_progress: addComment(prev.in_progress),
          done: addComment(prev.done),
        }))
      }
    })
    return unsub
  }, [])

  const createTicket = useCallback(async (title: string, description?: string, assignedAgentLocalId?: string, assignedAgentName?: string, category?: TicketCategory, attachments?: MessageAttachment[]) => {
    if (!projectId) return
    const ticket = await ipc.tickets.create(projectId, title, description, assignedAgentLocalId, assignedAgentName, category, attachments)
    return ticket
  }, [ipc, projectId])

  const updateTicket = useCallback(async (ticketId: string, updates: Partial<Ticket>) => {
    const ticket = await ipc.tickets.update(ticketId, updates)
    return ticket
  }, [ipc])

  const deleteTicket = useCallback(async (ticketId: string) => {
    // Optimistic remove
    setTickets((prev) => ({
      open: prev.open.filter((t) => t.id !== ticketId),
      in_progress: prev.in_progress.filter((t) => t.id !== ticketId),
      done: prev.done.filter((t) => t.id !== ticketId),
    }))
    await ipc.tickets.delete(ticketId)
  }, [ipc])

  const deleteTickets = useCallback(async (ticketIds: string[]) => {
    const idSet = new Set(ticketIds)
    setTickets((prev) => ({
      open: prev.open.filter((t) => !idSet.has(t.id)),
      in_progress: prev.in_progress.filter((t) => !idSet.has(t.id)),
      done: prev.done.filter((t) => !idSet.has(t.id)),
    }))
    await Promise.all(ticketIds.map((id) => ipc.tickets.delete(id)))
  }, [ipc])

  const addComment = useCallback(async (ticketId: string, content: string) => {
    if (!projectId) return
    const comment = await ipc.tickets.addComment(ticketId, projectId, content)
    return comment
  }, [ipc, projectId])

  const startVorhaben = useCallback(async (ticketIds: string[]) => {
    if (!projectId || ticketIds.length === 0) return
    await ipc.goals.startFromTickets(projectId, ticketIds)
  }, [ipc, projectId])

  const importTickets = useCallback(async (content?: string): Promise<ImportResult | undefined> => {
    if (!projectId) return
    const result = await ipc.tickets.importFromJson(projectId, content)
    if (result.success) {
      // Komplett neu laden — Import kann viele Tickets auf einmal ändern
      const groups = await ipc.tickets.getAll(projectId)
      setTickets(groups)
    }
    return result
  }, [ipc, projectId])

  return {
    tickets,
    loading,
    createTicket,
    updateTicket,
    deleteTicket,
    deleteTickets,
    addComment,
    importTickets,
    startVorhaben,
  }
}

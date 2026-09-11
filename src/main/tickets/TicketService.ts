import { removeAttachmentFolders } from '../app/attachments'
import { mainT } from '../app/settings'
import { withTransaction } from '../db/connection'
import { listAgents } from '../db/repositories/agents'
import { deleteAttachment, getAttachment } from '../db/repositories/messages'
import {
  addTicketComment,
  createTicket,
  deleteTicket,
  deleteTicketComment,
  deleteTicketComments,
  deleteTickets,
  getTicket,
  getTicketComment,
  getTicketByExternalId,
  getTicketDetail,
  listTickets,
  setTicketDependencies,
  updateTicket,
  type AddTicketCommentInput,
  type CreateTicketInput,
  type ListTicketsFilter,
  type UpdateTicketInput,
} from '../db/repositories/tickets'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import {
  parseTicketImportFile,
  planTicketImport,
  type PlannedTicket,
} from '@shared/ticketImport'
import type { MessageAttachment, Ticket, TicketComment, TicketDetail } from '@shared/types'

const log = scopedLogger('tickets')

export function list(filter: ListTicketsFilter): Ticket[] {
  return listTickets(filter)
}

export function get(id: string): TicketDetail | null {
  return getTicketDetail(id)
}

export function create(input: CreateTicketInput): Ticket {
  const ticket = createTicket(input)
  notify(ticket, 'created')
  return ticket
}

export function update(id: string, patch: UpdateTicketInput): Ticket {
  const ticket = updateTicket(id, patch)
  notify(ticket, 'updated')
  return ticket
}

export async function remove(id: string): Promise<void> {
  const ticket = getTicket(id)
  const { attachmentPaths } = deleteTicket(id)
  await removeAttachmentFolders(attachmentPaths)
  if (ticket) notify(ticket, 'removed')
}

/**
 * Sammellöschen: eine Transaktion, ein Ereignis. Unbekannte IDs fallen still weg, damit ein
 * veralteter Renderer-Zustand nicht die ganze Aktion scheitern lässt.
 */
export async function removeMany(ids: string[]): Promise<{ removed: number }> {
  const unique = [...new Set(ids)]
  const known = unique.map(getTicket).filter((ticket): ticket is Ticket => ticket !== null)
  if (known.length === 0) return { removed: 0 }

  const { removed, attachmentPaths } = deleteTickets(known.map((ticket) => ticket.id))
  await removeAttachmentFolders(attachmentPaths)

  // Ein gebündeltes Ereignis pro Projekt — sonst flackert das Board bei zwanzig Tickets.
  const byProject = new Map<string, string[]>()
  for (const ticket of known) {
    const bucket = byProject.get(ticket.projectId)
    if (bucket) bucket.push(ticket.id)
    else byProject.set(ticket.projectId, [ticket.id])
  }
  for (const [projectId, ticketIds] of byProject) {
    emitEvent('ticket.changed', {
      projectId,
      ticketId: ticketIds[0]!,
      ticketIds,
      action: 'removed',
    })
  }

  log.info('Tickets gelöscht', {
    requested: unique.length,
    removed,
    attachments: attachmentPaths.length,
  })
  return { removed }
}

/**
 * Löst einen Anhang vom Ticket und löscht seine Datei. Der Anhang muss wirklich an diesem
 * Ticket hängen — so kann eine veraltete Oberfläche nicht die Datei eines fremden Tickets
 * treffen.
 */
export async function removeAttachment(
  ticketId: string,
  attachmentId: string,
): Promise<MessageAttachment> {
  const ticket = getTicket(ticketId)
  if (!ticket) throw new Error(mainT()('main.error.ticketGone'))

  const attachment = getAttachment(attachmentId)
  if (!attachment || attachment.ticketId !== ticketId) {
    throw new Error(mainT()('main.error.attachmentGone'))
  }

  deleteAttachment(attachment.id)
  await removeAttachmentFolders([attachment.relativePath])
  notify(ticket, 'updated')
  log.info('Anhang vom Ticket entfernt', { ticketId, attachmentId })
  return attachment
}

export function addComment(input: AddTicketCommentInput): TicketComment {
  const comment = addTicketComment(input)
  const ticket = getTicket(input.ticketId)
  if (ticket) notify(ticket, 'updated')
  return comment
}

/**
 * Löscht einen Kommentar. Bewusst nur vom Nutzer aufrufbar: Es gibt kein MCP-Werkzeug dazu,
 * denn Kommentare sind das Protokoll dessen, was ein Agent getan hat — einschließlich seiner
 * Fehlversuche. Ein Agent, der sein eigenes Scheitern wegräumen kann, nimmt dem Menschen die
 * einzige Spur, an der er erkennt, warum ein Ticket fünf Anläufe gebraucht hat. Aufräumen ist
 * eine Entscheidung des Nutzers, nicht der Maschine.
 */
export function removeComment(commentId: string): { removed: number } {
  const comment = getTicketComment(commentId)
  if (!comment) return { removed: 0 }

  const removed = deleteTicketComment(commentId)
  const ticket = getTicket(comment.ticketId)
  if (removed > 0 && ticket) notify(ticket, 'updated')
  log.info('Ticket-Kommentar gelöscht', { ticketId: comment.ticketId, commentId })
  return { removed }
}

/**
 * Löscht alle Kommentare eines Tickets in einer Transaktion und meldet danach **ein**
 * gebündeltes Ereignis, nicht eines je Kommentar. Wie bei `removeComment` gibt es dafür
 * bewusst kein MCP-Werkzeug.
 */
export function clearComments(ticketId: string): { removed: number } {
  const ticket = getTicket(ticketId)
  if (!ticket) throw new Error(mainT()('main.error.ticketGone'))

  const removed = deleteTicketComments(ticketId)
  if (removed > 0) notify(ticket, 'updated')
  log.info('Ticket-Kommentare geleert', { ticketId, removed })
  return { removed }
}

/** Ersetzt die Abhängigkeiten vollständig; Selbstbezüge und Unbekanntes fallen weg. */
export function setDependencies(ticketId: string, dependsOn: string[]): TicketDetail {
  const ticket = getTicket(ticketId)
  if (!ticket) throw new Error(`Ticket ${ticketId} existiert nicht`)

  const valid = dependsOn.filter((id) => id !== ticketId && getTicket(id) !== null)
  setTicketDependencies(ticketId, valid)
  notify(ticket, 'updated')
  return getTicketDetail(ticketId)!
}

export interface ImportResult {
  created: number
  updated: number
  tickets: Ticket[]
  warnings: string[]
}

/**
 * Upsert über `external_id`: bestehende Tickets werden aktualisiert, behalten dabei aber
 * ihren Status — der gehört dem Fortschritt in der App, nicht der Importdatei.
 */
export function importJson(projectId: string, json: string): ImportResult {
  const file = parseTicketImportFile(json)
  const externalIds = collectExternalIds(file.tickets.map((entry) => entry.id), file.epic?.id)
  const existing = new Map<string, Ticket>()
  for (const externalId of externalIds) {
    const ticket = getTicketByExternalId(projectId, externalId)
    if (ticket) existing.set(externalId, ticket)
  }

  const plan = planTicketImport(file, {
    existingExternalIds: [...existing.keys()],
    sortOrderOffset: listTickets({ projectId }).length,
  })
  const warnings = [...plan.warnings]
  const assignees = buildAssigneeIndex()

  const result = withTransaction((): { created: number; updated: number; tickets: Ticket[] } => {
    const byExternalId = new Map<string, Ticket>()
    let created = 0
    let updated = 0

    // Erste Runde ohne Epic-Verweise — die Ziele existieren teils erst danach.
    for (const planned of plan.tickets) {
      const assignedAgentId = resolveAssignee(planned, assignees, warnings)
      const known = existing.get(planned.externalId)
      if (known) {
        const ticket = updateTicket(known.id, {
          title: planned.title,
          description: planned.description,
          category: planned.category,
          sortOrder: planned.sortOrder,
          ...(assignedAgentId ? { assignedAgentId } : {}),
        })
        byExternalId.set(planned.externalId, ticket)
        updated += 1
      } else {
        const ticket = createTicket({
          projectId,
          title: planned.title,
          description: planned.description,
          status: planned.status,
          category: planned.category,
          externalId: planned.externalId,
          assignedAgentId,
          sortOrder: planned.sortOrder,
        })
        byExternalId.set(planned.externalId, ticket)
        created += 1
      }
    }

    // Zweite Runde: Epic-Zuordnung und Abhängigkeiten, jetzt sind alle IDs bekannt.
    for (const planned of plan.tickets) {
      if (!planned.epicExternalId) continue
      const ticket = byExternalId.get(planned.externalId)
      const epic = byExternalId.get(planned.epicExternalId) ?? existing.get(planned.epicExternalId)
      if (!ticket || !epic || epic.id === ticket.id) continue
      byExternalId.set(planned.externalId, updateTicket(ticket.id, { epicId: epic.id }))
    }

    for (const dependency of plan.dependencies) {
      const ticket = byExternalId.get(dependency.externalId)
      if (!ticket) continue
      const ids: string[] = []
      for (const reference of dependency.dependsOn) {
        const target = byExternalId.get(reference) ?? existing.get(reference)
        if (target) ids.push(target.id)
      }
      setTicketDependencies(ticket.id, ids)
    }

    return { created, updated, tickets: [...byExternalId.values()] }
  })

  for (const ticket of result.tickets) {
    notify(ticket, existing.has(ticket.externalId ?? '') ? 'updated' : 'created')
  }
  log.info('Tickets importiert', {
    projectId,
    created: result.created,
    updated: result.updated,
    warnings: warnings.length,
  })

  return { ...result, warnings }
}

function collectExternalIds(ids: string[], epicId: string | undefined): string[] {
  const all = epicId ? [epicId, ...ids] : ids
  return [...new Set(all)]
}

/** Erlaubt in `assignee` sowohl `@kuerzel` als auch den Klarnamen eines Agenten. */
function buildAssigneeIndex(): Map<string, string> {
  const index = new Map<string, string>()
  for (const agent of listAgents()) {
    index.set(agent.mentionKey.toLowerCase(), agent.id)
    index.set(agent.mentionKey.replace(/^@/, '').toLowerCase(), agent.id)
    index.set(agent.name.toLowerCase(), agent.id)
  }
  return index
}

function resolveAssignee(
  planned: PlannedTicket,
  index: Map<string, string>,
  warnings: string[],
): string | null {
  const raw = planned.assignee?.trim()
  if (!raw) return null
  const agentId = index.get(raw.toLowerCase())
  if (agentId) return agentId
  warnings.push(`Für "${planned.externalId}" gibt es keinen Agenten namens "${raw}".`)
  return null
}

function notify(ticket: Ticket, action: 'created' | 'updated' | 'removed'): void {
  emitEvent('ticket.changed', { projectId: ticket.projectId, ticketId: ticket.id, action })
}

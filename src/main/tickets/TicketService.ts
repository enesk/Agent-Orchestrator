import { withTransaction } from '../db/connection'
import { listAgents } from '../db/repositories/agents'
import {
  addTicketComment,
  createTicket,
  deleteTicket,
  getTicket,
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
import type { Ticket, TicketComment, TicketDetail } from '@shared/types'

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

export function remove(id: string): void {
  const ticket = getTicket(id)
  deleteTicket(id)
  if (ticket) notify(ticket, 'removed')
}

export function addComment(input: AddTicketCommentInput): TicketComment {
  const comment = addTicketComment(input)
  const ticket = getTicket(input.ticketId)
  if (ticket) notify(ticket, 'updated')
  return comment
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

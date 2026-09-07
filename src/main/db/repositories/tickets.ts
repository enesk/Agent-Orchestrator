import { getDb, nowIso } from '../connection'
import { buildUpdate, newId } from '../utils'
import { listAttachmentsForTicket } from './messages'
import type { TicketCategory, TicketStatus } from '@shared/constants'
import type { Ticket, TicketAuthorType, TicketComment, TicketDetail } from '@shared/types'

interface TicketRow {
  id: string
  project_id: string
  number: number
  title: string
  description: string | null
  status: TicketStatus
  category: TicketCategory
  assigned_agent_id: string | null
  goal_id: number | null
  external_id: string | null
  epic_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

interface TicketCommentRow {
  id: string
  ticket_id: string
  author_type: TicketAuthorType
  agent_id: string | null
  content: string
  created_at: string
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    projectId: row.project_id,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    category: row.category,
    assignedAgentId: row.assigned_agent_id,
    goalId: row.goal_id,
    externalId: row.external_id,
    epicId: row.epic_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toComment(row: TicketCommentRow): TicketComment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type,
    agentId: row.agent_id,
    content: row.content,
    createdAt: row.created_at,
  }
}

export interface ListTicketsFilter {
  projectId: string
  status?: TicketStatus
  category?: TicketCategory
  assignedAgentId?: string | null
  goalId?: number | null
}

export function listTickets(filter: ListTicketsFilter): Ticket[] {
  const conditions = ['project_id = ?']
  const values: unknown[] = [filter.projectId]

  if (filter.status !== undefined) {
    conditions.push('status = ?')
    values.push(filter.status)
  }
  if (filter.category !== undefined) {
    conditions.push('category = ?')
    values.push(filter.category)
  }
  if (filter.assignedAgentId !== undefined) {
    if (filter.assignedAgentId === null) {
      conditions.push('assigned_agent_id IS NULL')
    } else {
      conditions.push('assigned_agent_id = ?')
      values.push(filter.assignedAgentId)
    }
  }
  if (filter.goalId !== undefined) {
    if (filter.goalId === null) {
      conditions.push('goal_id IS NULL')
    } else {
      conditions.push('goal_id = ?')
      values.push(filter.goalId)
    }
  }

  return getDb()
    .prepare<unknown[], TicketRow>(
      `SELECT * FROM tickets WHERE ${conditions.join(' AND ')} ORDER BY sort_order, number`,
    )
    .all(...values)
    .map(toTicket)
}

export function getTicket(id: string): Ticket | null {
  const row = getDb().prepare<[string], TicketRow>('SELECT * FROM tickets WHERE id = ?').get(id)
  return row ? toTicket(row) : null
}

export function getTicketByNumber(projectId: string, number: number): Ticket | null {
  const row = getDb()
    .prepare<[string, number], TicketRow>(
      'SELECT * FROM tickets WHERE project_id = ? AND number = ?',
    )
    .get(projectId, number)
  return row ? toTicket(row) : null
}

export function getTicketByExternalId(projectId: string, externalId: string): Ticket | null {
  const row = getDb()
    .prepare<[string, string], TicketRow>(
      'SELECT * FROM tickets WHERE project_id = ? AND external_id = ?',
    )
    .get(projectId, externalId)
  return row ? toTicket(row) : null
}

export function getTicketDetail(id: string): TicketDetail | null {
  const ticket = getTicket(id)
  if (!ticket) return null
  return {
    ...ticket,
    comments: listTicketComments(id),
    dependencies: listDependencies(id),
    dependents: listDependents(id),
    attachments: listAttachmentsForTicket(id),
  }
}

export function nextTicketNumber(projectId: string): number {
  const row = getDb()
    .prepare<[string], { next: number | null }>(
      'SELECT MAX(number) + 1 AS next FROM tickets WHERE project_id = ?',
    )
    .get(projectId)
  return row?.next ?? 1
}

export interface CreateTicketInput {
  projectId: string
  title: string
  description?: string | null
  status?: TicketStatus
  category?: TicketCategory
  assignedAgentId?: string | null
  goalId?: number | null
  externalId?: string | null
  epicId?: string | null
  sortOrder?: number
}

export function createTicket(input: CreateTicketInput): Ticket {
  const id = newId()
  const now = nowIso()
  const db = getDb()
  const insert = db.transaction((): void => {
    const number = nextTicketNumber(input.projectId)
    db.prepare(
      `INSERT INTO tickets (id, project_id, number, title, description, status, category,
                            assigned_agent_id, goal_id, external_id, epic_id, sort_order,
                            created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      number,
      input.title,
      input.description ?? null,
      input.status ?? 'open',
      input.category ?? 'task',
      input.assignedAgentId ?? null,
      input.goalId ?? null,
      input.externalId ?? null,
      input.epicId ?? null,
      input.sortOrder ?? number,
      now,
      now,
    )
  })
  insert()
  return getTicket(id)!
}

export interface UpdateTicketInput {
  title?: string
  description?: string | null
  status?: TicketStatus
  category?: TicketCategory
  assignedAgentId?: string | null
  goalId?: number | null
  externalId?: string | null
  epicId?: string | null
  sortOrder?: number
}

export function updateTicket(id: string, patch: UpdateTicketInput): Ticket {
  const { clause, values } = buildUpdate({
    title: patch.title,
    description: patch.description,
    status: patch.status,
    category: patch.category,
    assigned_agent_id: patch.assignedAgentId,
    goal_id: patch.goalId,
    external_id: patch.externalId,
    epic_id: patch.epicId,
    sort_order: patch.sortOrder,
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE tickets SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const ticket = getTicket(id)
  if (!ticket) throw new Error(`Ticket ${id} existiert nicht`)
  return ticket
}

export function deleteTicket(id: string): void {
  getDb().prepare('DELETE FROM tickets WHERE id = ?').run(id)
}

// --- Kommentare -------------------------------------------------------------

export function listTicketComments(ticketId: string): TicketComment[] {
  return getDb()
    .prepare<[string], TicketCommentRow>(
      'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at, rowid',
    )
    .all(ticketId)
    .map(toComment)
}

export interface AddTicketCommentInput {
  ticketId: string
  authorType: TicketAuthorType
  agentId?: string | null
  content: string
}

export function addTicketComment(input: AddTicketCommentInput): TicketComment {
  const id = newId()
  getDb()
    .prepare(
      `INSERT INTO ticket_comments (id, ticket_id, author_type, agent_id, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.ticketId, input.authorType, input.agentId ?? null, input.content, nowIso())
  const row = getDb()
    .prepare<[string], TicketCommentRow>('SELECT * FROM ticket_comments WHERE id = ?')
    .get(id)
  return toComment(row!)
}

export function deleteTicketComment(id: string): void {
  getDb().prepare('DELETE FROM ticket_comments WHERE id = ?').run(id)
}

// --- Abhängigkeiten ---------------------------------------------------------

export function listDependencies(ticketId: string): string[] {
  return getDb()
    .prepare<[string], { depends_on_id: string }>(
      'SELECT depends_on_id FROM ticket_dependencies WHERE ticket_id = ?',
    )
    .all(ticketId)
    .map((row) => row.depends_on_id)
}

export function listDependents(ticketId: string): string[] {
  return getDb()
    .prepare<[string], { ticket_id: string }>(
      'SELECT ticket_id FROM ticket_dependencies WHERE depends_on_id = ?',
    )
    .all(ticketId)
    .map((row) => row.ticket_id)
}

export function setTicketDependencies(ticketId: string, dependsOn: string[]): void {
  const db = getDb()
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM ticket_dependencies WHERE ticket_id = ?').run(ticketId)
    const insert = db.prepare(
      'INSERT OR IGNORE INTO ticket_dependencies (ticket_id, depends_on_id) VALUES (?, ?)',
    )
    for (const dependencyId of dependsOn) {
      if (dependencyId === ticketId) continue
      insert.run(ticketId, dependencyId)
    }
  })
  replace()
}

/** Tickets, deren Abhängigkeiten alle erledigt sind — der Goal-Loop wählt daraus. */
export function listUnblockedTickets(projectId: string, status: TicketStatus = 'open'): Ticket[] {
  return getDb()
    .prepare<[string, TicketStatus], TicketRow>(
      `SELECT t.* FROM tickets t
        WHERE t.project_id = ? AND t.status = ?
          AND NOT EXISTS (
            SELECT 1 FROM ticket_dependencies d
              JOIN tickets dep ON dep.id = d.depends_on_id
             WHERE d.ticket_id = t.id AND dep.status <> 'done'
          )
        ORDER BY t.sort_order, t.number`,
    )
    .all(projectId, status)
    .map(toTicket)
}

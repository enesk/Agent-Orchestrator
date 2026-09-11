import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TICKET_CATEGORIES, TICKET_STATUS_LABELS, type TicketCategory } from '@shared/constants'
import { attachmentPromptLines } from '../../agents/attachmentPrompt'
import { getAgent } from '../../db/repositories/agents'
import { countAttachmentsByTicket } from '../../db/repositories/messages'
import { getTicket, getTicketByNumber } from '../../db/repositories/tickets'
import * as tickets from '../../tickets/TicketService'
import { scopedLogger } from '../../Logger'
import { resolveAssignee, type ToolContext } from './context'
import { fail, ok } from './result'
import type { Ticket } from '@shared/types'

const log = scopedLogger('mcp.tickets')

const categoryValues = TICKET_CATEGORIES.map((entry) => entry.value) as [
  TicketCategory,
  ...TicketCategory[],
]

const statusSchema = z.enum(['open', 'in_progress', 'done'])

function agentLabel(agentId: string | null): string {
  if (!agentId) return 'nicht zugewiesen'
  return getAgent(agentId)?.mentionKey ?? 'unbekannt'
}

function summarize(ticket: Ticket): string {
  return `#${ticket.number} [${TICKET_STATUS_LABELS[ticket.status]}] ${ticket.title} — ${agentLabel(ticket.assignedAgentId)}`
}

export function registerTicketTools(server: McpServer, tool: ToolContext): void {
  const { projectId, agentId, goalId } = tool.context

  server.registerTool(
    'ticket_create',
    {
      title: 'Ticket anlegen',
      description:
        'Legt ein neues Ticket im aktuellen Projekt an. Nutze das immer dann, wenn eine ' +
        'Aufgabe festgehalten werden soll — schreibe niemals Ticket-Markierungen in den Text.',
      inputSchema: {
        title: z.string().min(1).describe('Kurze, aussagekräftige Überschrift'),
        description: z.string().describe('Was zu tun ist, in Markdown'),
        category: z.enum(categoryValues).optional().describe('Standard: task'),
        assignee: z
          .string()
          .optional()
          .describe('Erwähnungskürzel oder Name eines Agenten dieses Projekts'),
      },
      annotations: { title: 'Ticket anlegen' },
    },
    ({ title, description, category, assignee }) => {
      const resolved = resolveAssignee(projectId, assignee)
      if (resolved.error) return fail(resolved.error)

      const ticket = tickets.create({
        projectId,
        title: title.trim(),
        description,
        category: category ?? 'task',
        assignedAgentId: resolved.agentId,
        goalId: goalId ?? null,
      })
      log.info('Ticket über Werkzeug angelegt', {
        projectId,
        agentId,
        number: ticket.number,
        ticketId: ticket.id,
      })
      return ok(`Ticket #${ticket.number} angelegt (ID ${ticket.id}).`)
    },
  )

  server.registerTool(
    'ticket_update',
    {
      title: 'Ticket ändern',
      description:
        'Ändert Status, Beschreibung oder Zuweisung eines Tickets. Der Status eines Tickets ' +
        'ändert sich ausschließlich hierüber, nie durch eine Aussage im Chat.',
      inputSchema: {
        number: z.number().int().positive().describe('Ticketnummer, z.B. 12 für #12'),
        status: statusSchema.optional(),
        description: z.string().optional(),
        assignee: z
          .string()
          .optional()
          .describe('Erwähnungskürzel oder Name; leerer Text hebt die Zuweisung auf'),
      },
      annotations: { title: 'Ticket ändern' },
    },
    ({ number, status, description, assignee }) => {
      const existing = getTicketByNumber(projectId, number)
      if (!existing) return fail(`In diesem Projekt gibt es kein Ticket #${number}.`)

      const resolved = resolveAssignee(projectId, assignee)
      if (resolved.error) return fail(resolved.error)

      const ticket = tickets.update(existing.id, {
        ...(status !== undefined ? { status } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(assignee !== undefined ? { assignedAgentId: resolved.agentId } : {}),
      })
      log.info('Ticket über Werkzeug geändert', {
        projectId,
        agentId,
        number: ticket.number,
        status: ticket.status,
      })
      return ok(`Ticket #${ticket.number} aktualisiert: ${summarize(ticket)}`)
    },
  )

  /**
   * `ticket_comment` ist bewusst nur schreibend: Es gibt kein Werkzeug zum Löschen von
   * Kommentaren. Kommentare sind das Protokoll dessen, was ein Agent getan hat —
   * einschließlich seiner Fehlversuche. Ein Agent, der sein eigenes Scheitern wegräumen kann,
   * nimmt dem Menschen die einzige Spur, an der er erkennt, warum ein Ticket fünf Anläufe
   * gebraucht hat. Aufräumen ist eine Entscheidung des Nutzers, nicht der Maschine — es läuft
   * über `tickets.removeComment` und `tickets.clearComments` im Detail-Panel.
   */
  server.registerTool(
    'ticket_comment',
    {
      title: 'Ticket kommentieren',
      description: 'Hängt einen Kommentar an ein Ticket — der übliche Weg für Zwischenstände.',
      inputSchema: {
        number: z.number().int().positive(),
        content: z.string().min(1).describe('Kommentartext in Markdown'),
      },
      annotations: { title: 'Ticket kommentieren' },
    },
    ({ number, content }) => {
      const ticket = getTicketByNumber(projectId, number)
      if (!ticket) return fail(`In diesem Projekt gibt es kein Ticket #${number}.`)

      tickets.addComment({ ticketId: ticket.id, authorType: 'agent', agentId, content })
      return ok(`Kommentar an Ticket #${number} gespeichert.`)
    },
  )

  server.registerTool(
    'ticket_list',
    {
      title: 'Tickets auflisten',
      description: 'Listet die Tickets des aktuellen Projekts, wahlweise nach Status gefiltert.',
      inputSchema: { status: statusSchema.optional() },
      annotations: { title: 'Tickets auflisten', readOnlyHint: true },
    },
    ({ status }) => {
      const found = tickets.list({ projectId, ...(status !== undefined ? { status } : {}) })
      if (found.length === 0) return ok('Keine Tickets gefunden.')

      // Nur die Anzahl, keine Pfade — die holt sich der Agent bei Bedarf über `ticket_get`.
      const counts = countAttachmentsByTicket(found.map((ticket) => ticket.id))
      return ok(
        found
          .map((ticket) => {
            const count = counts.get(ticket.id) ?? 0
            if (count === 0) return summarize(ticket)
            return `${summarize(ticket)} — ${count} ${count === 1 ? 'Anhang' : 'Anhänge'}`
          })
          .join('\n'),
      )
    },
  )

  server.registerTool(
    'ticket_get',
    {
      title: 'Ticket lesen',
      description:
        'Liefert ein Ticket vollständig, inklusive Kommentaren, Abhängigkeiten und Anhängen. ' +
        'Angehängte Dateien stehen mit absolutem Pfad darin — lies sie mit dem Read-Werkzeug.',
      inputSchema: { number: z.number().int().positive() },
      annotations: { title: 'Ticket lesen', readOnlyHint: true },
    },
    ({ number }) => {
      const ticket = getTicketByNumber(projectId, number)
      if (!ticket) return fail(`In diesem Projekt gibt es kein Ticket #${number}.`)

      const detail = tickets.get(ticket.id)
      if (!detail) return fail(`Ticket #${number} konnte nicht gelesen werden.`)

      const numbers = (ids: readonly string[]): string =>
        ids
          .map((id) => getTicket(id))
          .filter((entry): entry is Ticket => entry !== null)
          .map((entry) => `#${entry.number}`)
          .join(', ') || '—'

      const comments =
        detail.comments.length === 0
          ? '—'
          : detail.comments
              .map(
                (comment) =>
                  `- ${comment.authorType === 'agent' ? agentLabel(comment.agentId) : 'Nutzer'} ` +
                  `(${comment.createdAt}): ${comment.content}`,
              )
              .join('\n')

      const attachments =
        detail.attachments.length === 0 ? '—' : attachmentPromptLines(detail.attachments).join('\n')

      return ok(
        [
          `# Ticket #${detail.number}: ${detail.title}`,
          `Status: ${TICKET_STATUS_LABELS[detail.status]}`,
          `Kategorie: ${detail.category}`,
          `Zuweisung: ${agentLabel(detail.assignedAgentId)}`,
          `Hängt ab von: ${numbers(detail.dependencies)}`,
          `Blockiert: ${numbers(detail.dependents)}`,
          '',
          '## Beschreibung',
          detail.description?.trim() || '—',
          '',
          '## Anhänge',
          attachments,
          '',
          '## Kommentare',
          comments,
        ].join('\n'),
      )
    },
  )
}

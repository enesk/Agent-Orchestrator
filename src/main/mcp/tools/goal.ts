import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getTicketByNumber } from '../../db/repositories/tickets'
import { scopedLogger } from '../../Logger'
import { setReport } from '../RunContextRegistry'
import type { ToolContext } from './context'
import { fail, ok } from './result'

const log = scopedLogger('mcp.goal')

export function registerGoalTools(server: McpServer, tool: ToolContext): void {
  const { projectId, agentId, goalId } = tool.context

  server.registerTool(
    'goal_report',
    {
      title: 'Ergebnis melden',
      description:
        'Meldet das Ergebnis dieses Arbeitsschritts an den Vorhaben-Ablauf: erledigt, noch ' +
        'einmal versuchen, oder blockiert durch ein anderes Ticket. Genau einmal am Ende ' +
        'aufrufen — der Ablauf wertet nur diese Meldung aus, nicht deinen Antworttext.',
      inputSchema: {
        kind: z.enum(['complete', 'retry', 'blocked_by']),
        summary: z.string().optional().describe('Ein bis drei Sätze, was passiert ist'),
        blockingTicketNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Nur bei blocked_by: die Nummer des blockierenden Tickets'),
      },
      annotations: { title: 'Ergebnis melden' },
    },
    ({ kind, summary, blockingTicketNumber }) => {
      if (goalId === null || goalId === undefined) {
        return fail(
          'Dieser Lauf gehört zu keinem Vorhaben; es gibt nichts zu melden. ' +
            'Antworte stattdessen einfach im Text.',
        )
      }

      if (kind === 'blocked_by') {
        if (blockingTicketNumber === undefined) {
          return fail('Bei „blocked_by" muss blockingTicketNumber angegeben werden.')
        }
        if (!getTicketByNumber(projectId, blockingTicketNumber)) {
          return fail(`In diesem Projekt gibt es kein Ticket #${blockingTicketNumber}.`)
        }
      }

      const stored = setReport(tool.token, {
        kind,
        summary: summary?.trim() || null,
        blockingTicketNumber: blockingTicketNumber ?? null,
        reportedAt: new Date().toISOString(),
      })
      if (!stored) return fail('Dieser Lauf ist bereits beendet; die Meldung kam zu spät.')

      log.info('Ergebnis gemeldet', { projectId, agentId, goalId, kind })
      return ok('Meldung übernommen.')
    },
  )
}

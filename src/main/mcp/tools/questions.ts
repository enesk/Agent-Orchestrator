import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { QUESTION_MAX_OPTIONS } from '@shared/ipc-contract'
import { scopedLogger } from '../../Logger'
// Direkt aus der Datei statt über `../../questions`: dessen Index zieht die Verdrahtung mit
// dem Chat mit, und die Verdrahtung importiert den Chat — über diesen Weg entstünde ein Kreis
// zwischen Werkzeugserver, Chat und Rückfragen.
import { ask } from '../../questions/QuestionService'
import { ASK_USER_DESCRIPTION, askAcceptedText } from '../../questions/prompt'
import { addQuestion } from '../RunContextRegistry'
import type { ToolContext } from './context'
import { fail, ok } from './result'

const log = scopedLogger('mcp.questions')

/**
 * `ask_user` — der einzige erlaubte Weg, auf eine Entscheidung des Nutzers zu warten. Das
 * Werkzeug legt die Frage ab und **beendet damit den Lauf**: ein Prozess, der über Stunden
 * auf eine Antwort wartet, wäre unbezahlbar. Die Antwort startet denselben Agenten im selben
 * Scope später erneut.
 */
export function registerQuestionTools(server: McpServer, tool: ToolContext): void {
  const { projectId, agentId, goalId, ticketId } = tool.context

  server.registerTool(
    'ask_user',
    {
      title: 'Rückfrage stellen',
      description: ASK_USER_DESCRIPTION,
      inputSchema: {
        question: z
          .string()
          .min(1)
          .describe('Die Frage, als ein Satz, den der Nutzer ohne Vorwissen beantworten kann'),
        options: z
          .array(z.string().min(1))
          .max(QUESTION_MAX_OPTIONS)
          .optional()
          .describe(
            `Höchstens ${QUESTION_MAX_OPTIONS} vorgeschlagene Antworten als Knöpfe. ` +
              'Freitext bleibt dem Nutzer immer möglich.',
          ),
        context: z
          .string()
          .optional()
          .describe('Was der Nutzer zur Lage wissen muss, um zu entscheiden — kurz gehalten'),
      },
      annotations: { title: 'Rückfrage stellen' },
    },
    ({ question, options, context }) => {
      if (!question.trim()) return fail('Die Frage darf nicht leer sein.')

      try {
        const created = ask({
          projectId,
          agentId,
          goalId: goalId ?? null,
          ticketId: ticketId ?? null,
          question,
          context: context ?? null,
          options: options ?? [],
        })

        // Am Kontext vermerkt, nicht im Antworttext: der Aufrufer muss erkennen können, dass
        // dieser Lauf wartet und nicht fertig ist, ohne den Text zu lesen.
        if (!addQuestion(tool.token, created.id)) {
          log.warn('Frage gestellt, aber der Lauf war schon beendet', { id: created.id })
        }

        log.info('Rückfrage angelegt', { id: created.id, projectId, agentId, ticketId })
        return ok(askAcceptedText(created))
      } catch (error) {
        return fail(
          `Die Frage konnte nicht hinterlegt werden: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    },
  )
}

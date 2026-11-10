import { postUserMessage, runAgent } from '../chat'
import { mainT } from '../app/settings'
import { scopedLogger } from '../Logger'
import { buildAnswerPrompt } from './prompt'
import { registerChatResumer, resolveScope, startExpirySweeper, stopExpirySweeper } from './QuestionService'

const log = scopedLogger('questions.wiring')

/**
 * Hängt die Fortsetzung eines Chatlaufs ein und startet den Fristenwächter. Dieselbe
 * Anschluss-Technik wie in `chat/wiring.ts`: der Dienst kennt den Chat nicht, sonst gäbe es
 * einen Importkreis zwischen Werkzeugserver, Chat und Rückfragen.
 */
export function initQuestions(): void {
  registerChatResumer(async (question) => {
    const scope = resolveScope(question)
    if (!scope) return
    const { project, agent } = scope

    // Die Antwort steht sichtbar im Verlauf — sonst wäre später nicht nachvollziehbar, warum
    // der Agent plötzlich weiterarbeitet.
    const trigger = postUserMessage({
      projectId: project.id,
      content: mainT()('main.question.chatAnswer', {
        question: question.question,
        answer: question.answer ?? '',
      }),
      mentions: [agent.id],
      metadata: { questionId: question.id },
    })

    // Derselbe Agent, derselbe Scope — die CLI-Session ist noch warm, der Kontext also da.
    // Angezeigt wird die Antwort, in den Prompt geht der vollständige Auftrag.
    await runAgent({
      project,
      agent,
      trigger,
      taskOverride: buildAnswerPrompt(question),
    })
  })

  startExpirySweeper()
  log.info('Rückfragen bereit')
}

export function stopQuestions(): void {
  stopExpirySweeper()
  registerChatResumer(null)
}

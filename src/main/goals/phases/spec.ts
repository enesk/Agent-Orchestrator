import { findDocumentByTitle } from '../../db/repositories/documents'
import { updateGoal } from '../../db/repositories/goals'
import * as documents from '../../documents/DocumentService'
import { emitGoalChanged, reportRateLimit, type GoalContext } from '../context'
import { ensureRoleAgent } from '../defaultAgents'
import { SPEC_ROLE_NOTE, buildSpecPrompt, specDocumentTitle } from '../prompts'
import { runGoalAgent } from '../runAgent'

/**
 * Der Agent mit der Rolle `planner` schreibt das Pflichtenheft und legt es über `doc_save` ab.
 * Speichert er es nicht, wird sein Antworttext als Pflichtenheft gesichert — ohne Dokument
 * hätten die folgenden Phasen keine Grundlage.
 */
export async function runSpecPhase(ctx: GoalContext): Promise<string> {
  const goal = ctx.goal()
  const agent = ensureRoleAgent(ctx.project.id, 'planner')
  const title = specDocumentTitle(goal)

  ctx.log({ message: 'Pflichtenheft wird geschrieben', phase: 'spec', agentId: agent.id })

  const result = await runGoalAgent({
    goalId: goal.id,
    project: ctx.project,
    agent,
    roleNote: SPEC_ROLE_NOTE,
    prompt: buildSpecPrompt(goal),
    label: 'goal-spec',
    chatLine: `Schreibt das Pflichtenheft für „${goal.title}"`,
    signal: ctx.signal,
    onRateLimit: reportRateLimit(ctx, 'spec', agent.id, 'das Pflichtenheft'),
  })

  let document = findDocumentByTitle(ctx.project.id, title)
  if (!document) {
    if (!result.text.trim()) {
      throw new Error('Die Planung hat kein Pflichtenheft geliefert.')
    }
    document = documents.save({
      projectId: ctx.project.id,
      title,
      content: result.text,
      agentId: agent.id,
    })
    ctx.log({
      message: 'Das Pflichtenheft kam nicht über das Werkzeug — die Antwort wurde gesichert',
      phase: 'spec',
      agentId: agent.id,
      status: 'running',
    })
  }

  emitGoalChanged(updateGoal(goal.id, { specDocumentId: document.id }))
  ctx.patchCheckpoint({ resumeAt: null })
  ctx.log({
    message: `Pflichtenheft steht: „${document.title}"`,
    phase: 'spec',
    agentId: agent.id,
    status: 'success',
  })

  return document.content
}

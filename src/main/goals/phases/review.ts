import { getDocument } from '../../db/repositories/documents'
import { getTicket, listDependencies, listTickets } from '../../db/repositories/tickets'
import { reportRateLimit, type GoalContext } from '../context'
import { ensureRoleAgent } from '../defaultAgents'
import { REVIEW_ROLE_NOTE, buildReviewPrompt } from '../prompts'
import { runGoalAgent } from '../runAgent'
import type { Ticket } from '@shared/types'

export type ReviewOutcome = 'complete' | 'retry'

/**
 * Der Agent mit der Rolle `reviewer` prüft gegen den Code und meldet über `goal_report`.
 * Bleibt die Meldung aus, entscheidet der Ticketstand — schweigen darf nicht als Erfolg gelten.
 */
export async function runReviewPhase(ctx: GoalContext): Promise<ReviewOutcome> {
  const goal = ctx.goal()
  const agent = ensureRoleAgent(ctx.project.id, 'reviewer')
  const tickets = listTickets({ projectId: ctx.project.id, goalId: goal.id })

  const done = tickets.filter((ticket) => ticket.status === 'done')
  const rest = tickets.filter((ticket) => ticket.status !== 'done')
  const blocked = rest.filter((ticket) => hasOpenDependency(ticket))
  const open = rest.filter((ticket) => !blocked.includes(ticket))

  const spec = goal.specDocumentId ? (getDocument(goal.specDocumentId)?.content ?? null) : null

  ctx.log({ message: 'Abnahme läuft', phase: 'review', agentId: agent.id })

  const result = await runGoalAgent({
    goalId: goal.id,
    project: ctx.project,
    agent,
    roleNote: REVIEW_ROLE_NOTE,
    prompt: buildReviewPrompt({ goal, spec, done, open, blocked }),
    label: 'goal-review',
    chatLine: `Prüft das Ergebnis von „${goal.title}"`,
    signal: ctx.signal,
    onRateLimit: reportRateLimit(ctx, 'review', agent.id, 'die Abnahme'),
  })

  ctx.patchCheckpoint({ resumeAt: null })

  const report = result.report
  if (report?.kind === 'complete') {
    ctx.log({
      message: report.summary ?? 'Abnahme bestanden',
      phase: 'review',
      agentId: agent.id,
      status: 'success',
    })
    return 'complete'
  }

  if (report?.kind === 'retry') {
    ctx.log({
      message: report.summary ?? 'Abnahme verlangt Nacharbeit',
      phase: 'review',
      agentId: agent.id,
      status: 'failed',
    })
    return 'retry'
  }

  // Ohne Meldung zählt allein, ob noch etwas offen ist.
  const remaining = listTickets({ projectId: ctx.project.id, goalId: goal.id }).filter(
    (ticket) => ticket.status !== 'done',
  )
  if (remaining.length === 0) {
    ctx.log({
      message: 'Keine Meldung aus der Abnahme — alle Tickets sind erledigt',
      phase: 'review',
      agentId: agent.id,
      status: 'success',
    })
    return 'complete'
  }

  ctx.log({
    message: `Keine Meldung aus der Abnahme — ${remaining.length} Ticket(s) sind noch offen`,
    phase: 'review',
    agentId: agent.id,
    status: 'failed',
  })
  return 'retry'
}

function hasOpenDependency(ticket: Ticket): boolean {
  return listDependencies(ticket.id).some((id) => getTicket(id)?.status !== 'done')
}

import { listTickets, updateTicket } from '../../db/repositories/tickets'
import { reportRateLimit, type GoalContext } from '../context'
import { ensureRoleAgent } from '../defaultAgents'
import { TICKETS_ROLE_NOTE, buildTicketsPrompt } from '../prompts'
import { runGoalAgent } from '../runAgent'
import type { Ticket } from '@shared/types'

/** Mehr Tickets als das macht ein Vorhaben unübersichtlich und den Ticketschnitt beliebig. */
const MAX_TICKETS = 15

/**
 * Der Agent mit der Rolle `pm` legt die Tickets über `ticket_create` an. Der Werkzeugserver
 * hängt sie am Vorhaben ein; hier wird nur nachgezogen, was vorher schon offen lag.
 */
export async function runTicketsPhase(ctx: GoalContext, spec: string | null): Promise<Ticket[]> {
  const goal = ctx.goal()
  const agent = ensureRoleAgent(ctx.project.id, 'pm')
  const before = new Set(listTickets({ projectId: ctx.project.id }).map((ticket) => ticket.id))

  ctx.log({ message: 'Tickets werden geschnitten', phase: 'tickets', agentId: agent.id })

  await runGoalAgent({
    goalId: goal.id,
    project: ctx.project,
    agent,
    roleNote: TICKETS_ROLE_NOTE,
    prompt: buildTicketsPrompt(goal, spec ?? goal.description ?? goal.title, MAX_TICKETS),
    label: 'goal-tickets',
    chatLine: `Schneidet die Tickets für „${goal.title}"`,
    signal: ctx.signal,
    onRateLimit: reportRateLimit(ctx, 'tickets', agent.id, 'der Ticketschnitt'),
  })

  // Alles, was während dieses Laufs entstanden ist, gehört zum Vorhaben — auch wenn der
  // Werkzeugaufruf den Vorhabenbezug einmal nicht gesetzt haben sollte.
  const created = listTickets({ projectId: ctx.project.id }).filter(
    (ticket) => !before.has(ticket.id),
  )
  for (const ticket of created) {
    if (ticket.goalId !== goal.id) updateTicket(ticket.id, { goalId: goal.id })
  }

  const own = listTickets({ projectId: ctx.project.id, goalId: goal.id })
  ctx.patchCheckpoint({
    resumeAt: null,
    ticketIds: own.map((ticket) => ticket.id),
    totalTickets: own.length,
  })

  if (own.length === 0) {
    throw new Error('Es sind keine Tickets entstanden — das Vorhaben hat nichts zu arbeiten.')
  }

  ctx.log({
    message: `${own.length} Ticket${own.length === 1 ? '' : 's'} angelegt`,
    phase: 'tickets',
    agentId: agent.id,
    status: 'success',
  })

  return own
}

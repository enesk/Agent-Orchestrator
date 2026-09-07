import { getDocument } from '../db/repositories/documents'
import {
  getTicket,
  getTicketByNumber,
  listDependencies,
  listDependents,
  listTickets,
} from '../db/repositories/tickets'
import * as agents from '../agents/AgentService'
import * as tickets from '../tickets/TicketService'
import { reportRateLimit, type GoalContext } from './context'
import { missingWorkerMessage, resolveWorkers } from './defaultAgents'
import { WORKER_ROLE_NOTE, buildWorkerPrompt, workerChatLine } from './prompts'
import { GoalAbortedError, runGoalAgent, throwIfAborted } from './runAgent'
import type { ProjectAgent, Ticket } from '@shared/types'

/** So viele Tickets laufen gleichzeitig. Mehr bringt nichts und macht die Ausgabe unlesbar. */
const MAX_PARALLEL = 3
/** So oft darf ein Ticket wegen einer Blockade zurück in die Warteschlange. */
const MAX_REQUEUES = 3

type OutcomeKind = 'done' | 'blocked' | 'unfinished' | 'failed'

interface Outcome {
  ticketId: string
  agentId: string
  kind: OutcomeKind
  blockingTicketNumber: number | null
  message: string
}

interface ActiveRun {
  agentId: string
  promise: Promise<Outcome>
}

/**
 * Arbeitet die Tickets eines Vorhabens ab — für beide Modi derselbe Weg. Bereit ist ein
 * Ticket, wenn alle seine Abhängigkeiten erledigt sind; bevorzugt wird, was andere blockiert.
 */
export async function runWorkPhase(ctx: GoalContext): Promise<void> {
  const goal = ctx.goal()
  const projectId = ctx.project.id

  const pool = resolveWorkers(projectId, goal.selectedAgentIds)
  if (pool.length === 0) throw new Error(missingWorkerMessage(projectId))

  const spec = goal.specDocumentId ? (getDocument(goal.specDocumentId)?.content ?? null) : null

  const workset = new Map<string, Ticket>()
  for (const ticket of listTickets({ projectId, goalId: goal.id })) {
    workset.set(ticket.id, ticket)
  }
  if (workset.size === 0) throw new Error('Dem Vorhaben ist kein Ticket zugeordnet.')

  const done = new Set<string>()
  const failed = new Set<string>()
  const active = new Map<string, ActiveRun>()
  const requeues: Record<string, number> = { ...ctx.checkpoint().requeues }

  for (const ticket of workset.values()) {
    if (ticket.status === 'done') done.add(ticket.id)
    // Ein Neustart findet Tickets vor, die beim Beenden mitten in Arbeit waren.
    else if (ticket.status === 'in_progress') reopen(ticket.id)
  }

  saveCheckpoint()
  ctx.log({
    message: `Arbeitsphase gestartet: ${workset.size - done.size} von ${workset.size} Tickets offen`,
    phase: 'work',
  })

  try {
    while (true) {
      throwIfAborted(ctx.signal)

      while (active.size < MAX_PARALLEL) {
        const ticket = pickReady()
        if (!ticket) break
        start(ticket)
      }

      if (active.size === 0) {
        const remaining = pending()
        if (remaining.length === 0) break
        deadlock(remaining)
        break
      }

      handle(await Promise.race([...active.values()].map((entry) => entry.promise)))
      saveCheckpoint()
    }
  } finally {
    // Ein Abbruch darf keine Läufe hinter sich lassen, die noch in die Datenbank schreiben.
    if (active.size > 0) await Promise.allSettled([...active.values()].map((e) => e.promise))
    saveCheckpoint()
  }

  ctx.log({
    message: `Arbeitsphase beendet: ${done.size} von ${workset.size} Tickets erledigt`,
    phase: 'work',
    status: done.size === workset.size ? 'success' : 'failed',
  })

  // --- Auswahl -------------------------------------------------------------

  /**
   * Was noch zu tun ist — frisch aus der Datenbank, weil ein Lauf auch fremde Tickets
   * erledigt haben kann. Erledigtes wandert dabei gleich in die Fertig-Menge.
   */
  function pending(): Ticket[] {
    const open: Ticket[] = []
    for (const id of workset.keys()) {
      if (failed.has(id) || active.has(id)) continue
      const fresh = getTicket(id)
      if (!fresh) continue
      workset.set(id, fresh)
      if (fresh.status === 'done') done.add(id)
      else open.push(fresh)
    }
    return open
  }

  function isReady(ticket: Ticket): boolean {
    return listDependencies(ticket.id).every((id) => getTicket(id)?.status === 'done')
  }

  /** Bereit und blockierend zuerst — sonst wartet der Rest auf ein spätes Ticket. */
  function pickReady(): Ticket | null {
    const ready = pending().filter(isReady)
    if (ready.length === 0) return null

    return ready.sort((a, b) => blockingWeight(b) - blockingWeight(a) || a.number - b.number)[0] ?? null
  }

  function blockingWeight(ticket: Ticket): number {
    return listDependents(ticket.id).filter((id) => workset.has(id) && !done.has(id)).length
  }

  function availableAgents(): ProjectAgent[] {
    return pool.filter((agent) => !agents.isStopped(projectId, agent.id))
  }

  /** Der Zuständige des Tickets hat Vorrang; sonst bekommt der am wenigsten belastete Agent es. */
  function chooseAgent(ticket: Ticket): ProjectAgent | null {
    const available = availableAgents()
    if (ticket.assignedAgentId) {
      const assigned = pool.find((agent) => agent.id === ticket.assignedAgentId)
      if (assigned) return available.some((agent) => agent.id === assigned.id) ? assigned : null
    }
    const load = (agent: ProjectAgent): number =>
      [...active.values()].filter((entry) => entry.agentId === agent.id).length
    return [...available].sort((a, b) => load(a) - load(b))[0] ?? null
  }

  // --- Ausführung ----------------------------------------------------------

  function start(ticket: Ticket): void {
    const agent = chooseAgent(ticket)
    if (!agent) {
      failed.add(ticket.id)
      reopen(ticket.id)
      ctx.log({
        message: `Ticket #${ticket.number} bleibt offen: kein freigegebener Agent für die Umsetzung`,
        phase: 'work',
        ticketId: ticket.id,
        status: 'failed',
      })
      return
    }

    const current = tickets.update(ticket.id, { status: 'in_progress', assignedAgentId: agent.id })
    workset.set(current.id, current)
    active.set(current.id, { agentId: agent.id, promise: execute(current, agent) })
    ctx.log({
      message: `Ticket #${current.number} „${current.title}" wird bearbeitet`,
      phase: 'work',
      agentId: agent.id,
      ticketId: current.id,
    })
    saveCheckpoint()
  }

  async function execute(ticket: Ticket, agent: ProjectAgent): Promise<Outcome> {
    try {
      const result = await runGoalAgent({
        goalId: goal.id,
        project: ctx.project,
        agent,
        roleNote: WORKER_ROLE_NOTE,
        prompt: buildWorkerPrompt({
          ticket,
          spec,
          otherTickets: [...workset.values()].filter((entry) => entry.id !== ticket.id),
          dependencies: listDependencies(ticket.id)
            .map((id) => getTicket(id))
            .filter((entry): entry is Ticket => entry !== null),
        }),
        label: 'goal-worker',
        ticketId: ticket.id,
        chatLine: workerChatLine(ticket),
        signal: ctx.signal,
        onRateLimit: reportRateLimit(ctx, 'work', agent.id, `Ticket #${ticket.number}`),
      })

      const report = result.report
      if (report?.kind === 'blocked_by') {
        return {
          ticketId: ticket.id,
          agentId: agent.id,
          kind: 'blocked',
          blockingTicketNumber: report.blockingTicketNumber,
          message: report.summary ?? `Ticket #${ticket.number} ist blockiert`,
        }
      }

      // Erledigt ist ein Ticket nur, wenn das Werkzeug den Status gesetzt hat.
      const fresh = getTicket(ticket.id)
      if (fresh?.status === 'done') {
        return {
          ticketId: ticket.id,
          agentId: agent.id,
          kind: 'done',
          blockingTicketNumber: null,
          message: `Ticket #${ticket.number} erledigt`,
        }
      }

      return {
        ticketId: ticket.id,
        agentId: agent.id,
        kind: 'unfinished',
        blockingTicketNumber: null,
        message: `Ticket #${ticket.number} wurde nicht als erledigt gemeldet`,
      }
    } catch (error) {
      return {
        ticketId: ticket.id,
        agentId: agent.id,
        kind: 'failed',
        blockingTicketNumber: null,
        message:
          error instanceof GoalAbortedError
            ? `Ticket #${ticket.number} abgebrochen`
            : `Ticket #${ticket.number} fehlgeschlagen: ${(error as Error).message}`,
      }
    }
  }

  // --- Ergebnisse ----------------------------------------------------------

  function handle(outcome: Outcome): void {
    active.delete(outcome.ticketId)
    const ticket = workset.get(outcome.ticketId)
    if (!ticket) return

    switch (outcome.kind) {
      case 'done':
        done.add(ticket.id)
        ctx.log({
          message: outcome.message,
          phase: 'work',
          agentId: outcome.agentId,
          ticketId: ticket.id,
          status: 'success',
        })
        return
      case 'blocked':
        handleBlocked(ticket, outcome)
        return
      default:
        failed.add(ticket.id)
        reopen(ticket.id)
        ctx.log({
          message: outcome.message,
          phase: 'work',
          agentId: outcome.agentId,
          ticketId: ticket.id,
          status: 'failed',
        })
    }
  }

  function handleBlocked(ticket: Ticket, outcome: Outcome): void {
    const number = outcome.blockingTicketNumber
    const blocking = number === null ? null : getTicketByNumber(projectId, number)

    if (!blocking || blocking.id === ticket.id) {
      failed.add(ticket.id)
      reopen(ticket.id)
      ctx.log({
        message: `Ticket #${ticket.number} meldet eine Blockade ohne gültiges Ticket`,
        phase: 'work',
        agentId: outcome.agentId,
        ticketId: ticket.id,
        status: 'failed',
      })
      return
    }

    if (!workset.has(blocking.id)) {
      workset.set(blocking.id, blocking)
      if (blocking.goalId !== goal.id) tickets.update(blocking.id, { goalId: goal.id })
      if (blocking.status === 'done') done.add(blocking.id)
      ctx.log({
        message: `Ticket #${blocking.number} kommt als Vorbedingung dazu`,
        phase: 'work',
        ticketId: blocking.id,
      })
    }

    // Die Abhängigkeit bleibt bestehen — beim nächsten Lauf wird nicht wieder blind gestartet.
    const existing = listDependencies(ticket.id)
    if (!existing.includes(blocking.id)) {
      tickets.setDependencies(ticket.id, [...existing, blocking.id])
    }

    const count = (requeues[ticket.id] ?? 0) + 1
    requeues[ticket.id] = count
    reopen(ticket.id)

    if (count > MAX_REQUEUES) {
      failed.add(ticket.id)
      ctx.log({
        message: `Ticket #${ticket.number} bleibt offen: nach ${MAX_REQUEUES} Wiedervorlagen immer noch blockiert`,
        phase: 'work',
        agentId: outcome.agentId,
        ticketId: ticket.id,
        status: 'failed',
      })
      return
    }

    ctx.log({
      message: `Ticket #${ticket.number} wartet auf #${blocking.number} (Wiedervorlage ${count})`,
      phase: 'work',
      agentId: outcome.agentId,
      ticketId: ticket.id,
    })
  }

  function deadlock(remaining: readonly Ticket[]): void {
    for (const ticket of remaining) {
      failed.add(ticket.id)
      reopen(ticket.id)
      ctx.log({
        message: `Ticket #${ticket.number} bleibt offen: seine Vorbedingungen wurden nie erledigt`,
        phase: 'work',
        ticketId: ticket.id,
        status: 'failed',
      })
    }
  }

  function reopen(ticketId: string): void {
    const ticket = getTicket(ticketId)
    if (!ticket || ticket.status === 'done') return
    const updated = tickets.update(ticketId, { status: 'open' })
    workset.set(updated.id, updated)
  }

  function saveCheckpoint(): void {
    ctx.patchCheckpoint({
      ticketIds: [...workset.keys()],
      doneTicketIds: [...done],
      totalTickets: workset.size,
      completedTickets: done.size,
      activeTickets: [...active.entries()].map(([ticketId, entry]) => ({
        ticketId,
        agentId: entry.agentId,
      })),
      requeues,
    })
  }
}

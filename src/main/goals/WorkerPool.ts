import { getDocument } from '../db/repositories/documents'
import {
  getTicket,
  getTicketByNumber,
  listDependencies,
  listDependents,
  listTicketComments,
  listTickets,
} from '../db/repositories/tickets'
import * as tickets from '../tickets/TicketService'
import { reportActivity, reportRateLimit, type GoalContext } from './context'
import { missingWorkerMessage, resolveWorkerCandidates, resolveWorkers } from './defaultAgents'
import { WORKER_ROLE_NOTE, buildWorkerPrompt, workerChatLine } from './prompts'
import { GoalAbortedError, runGoalAgent, sleep, throwIfAborted } from './runAgent'
import type { ProjectAgent, Ticket } from '@shared/types'

/** So viele Tickets laufen gleichzeitig. Mehr bringt nichts und macht die Ausgabe unlesbar. */
const MAX_PARALLEL = 3
/** So oft darf ein Ticket wegen einer gemeldeten Blockade zurück in die Warteschlange. */
const MAX_REQUEUES = 3
/** So oft wird ein Ticket angefasst, bevor es als steckengeblieben gilt. */
const MAX_ATTEMPTS = 5
/** So lange wartet die Phase, bevor sie erneut nach einem freien Agenten sieht. */
const AGENT_WAIT_MS = 5_000

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
 *
 * Die Phase läuft, bis nichts mehr zu tun ist. Ein misslungener Lauf ist kein Urteil, sondern
 * ein Versuch: das Ticket geht zurück in die Warteschlange und beim nächsten Mal an einen
 * anderen Agenten. Tickets, die währenddessen entstehen, kommen von selbst dazu, und eine
 * Verklemmung wird aufgelöst statt abgeschrieben.
 */
export async function runWorkPhase(ctx: GoalContext): Promise<void> {
  const goal = ctx.goal()
  const projectId = ctx.project.id
  const selectedAgentIds = goal.selectedAgentIds

  if (resolveWorkers(projectId, selectedAgentIds).length === 0) {
    throw new Error(missingWorkerMessage(projectId))
  }

  const spec = goal.specDocumentId ? (getDocument(goal.specDocumentId)?.content ?? null) : null
  const restored = ctx.checkpoint()

  const workset = new Map<string, Ticket>()
  const done = new Set<string>()
  const active = new Map<string, ActiveRun>()
  /** Tickets, die vorerst ruhen — die Phase läuft ohne sie weiter, gibt sie aber nicht auf. */
  const stuck = new Set<string>(restored.stuckTicketIds)
  /** Wer als Vorbedingung schon einmal einen Neuanfang bekommen hat, bekommt keinen zweiten. */
  const revived = new Set<string>(restored.revivedTicketIds)
  const requeues: Record<string, number> = { ...restored.requeues }
  const attempts: Record<string, number> = { ...restored.attempts }
  const tried: Record<string, string[]> = { ...restored.triedAgents }

  let waitingLogged = false

  absorb(false)
  if (workset.size === 0) throw new Error('Dem Vorhaben ist kein Ticket zugeordnet.')

  saveCheckpoint()
  ctx.log({
    message: `Arbeitsphase gestartet: ${workset.size - done.size} von ${workset.size} Tickets offen`,
    phase: 'work',
  })

  try {
    while (true) {
      throwIfAborted(ctx.signal)
      absorb(true)

      while (active.size < MAX_PARALLEL) {
        const ticket = pickReady()
        if (!ticket) break
        // Kein freier Agent — nicht das Ticket abschreiben, sondern gleich warten.
        if (!start(ticket)) break
      }

      if (active.size > 0) {
        handle(await Promise.race([...active.values()].map((entry) => entry.promise)))
        saveCheckpoint()
        continue
      }

      const open = pending()
      if (open.length === 0) break

      const workable = open.filter((ticket) => !stuck.has(ticket.id))
      if (workable.length === 0) {
        reportStuck(open)
        break
      }
      if (workable.some(isReady)) {
        await waitForAgent()
        continue
      }
      if (!resolveBlockage(workable)) {
        reportUnresolved(workable)
        break
      }
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

  // --- Arbeitsmenge --------------------------------------------------------

  /**
   * Zieht alle Tickets des Vorhabens nach. Läuft in jedem Durchlauf, damit Tickets, die ein
   * Agent gerade erst angelegt hat, ohne Sonderweg in der Warteschlange landen.
   */
  function absorb(announce: boolean): void {
    for (const ticket of listTickets({ projectId, goalId: goal.id })) {
      if (workset.has(ticket.id)) continue
      workset.set(ticket.id, ticket)

      if (ticket.status === 'done') done.add(ticket.id)
      // Ein Neustart findet Tickets vor, die beim Beenden mitten in Arbeit waren.
      else if (ticket.status === 'in_progress') reopen(ticket.id)

      if (announce) {
        ctx.log({
          message: `Ticket #${ticket.number} „${ticket.title}" kam neu dazu und wurde in die Warteschlange aufgenommen`,
          phase: 'work',
          ticketId: ticket.id,
        })
      }
    }
  }

  /**
   * Was noch zu tun ist — frisch aus der Datenbank, weil ein Lauf auch fremde Tickets
   * erledigt haben kann. Erledigtes wandert dabei gleich in die Fertig-Menge.
   */
  function pending(): Ticket[] {
    const open: Ticket[] = []
    for (const id of workset.keys()) {
      if (active.has(id)) continue
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
    const ready = pending().filter((ticket) => !stuck.has(ticket.id) && isReady(ticket))
    if (ready.length === 0) return null

    return ready.sort((a, b) => blockingWeight(b) - blockingWeight(a) || a.number - b.number)[0] ?? null
  }

  function blockingWeight(ticket: Ticket): number {
    return listDependents(ticket.id).filter((id) => workset.has(id) && !done.has(id)).length
  }

  // --- Agentenwahl ---------------------------------------------------------

  function candidates(): ProjectAgent[] {
    return resolveWorkerCandidates(projectId, selectedAgentIds)
  }

  function availableAgents(): ProjectAgent[] {
    return candidates().filter((agent) => !agent.stopped)
  }

  function everyAgentTried(ticketId: string): boolean {
    const list = tried[ticketId] ?? []
    return candidates().every((agent) => list.includes(agent.id))
  }

  /**
   * Beim ersten Anlauf hat der Zuständige des Tickets Vorrang. Danach bekommt es einen
   * anderen Agenten als zuletzt — wer schon gescheitert ist, scheitert meist wieder.
   */
  function chooseAgent(ticket: Ticket): ProjectAgent | null {
    const available = availableAgents()
    if (available.length === 0) return null

    const list = tried[ticket.id] ?? []
    if (list.length === 0 && ticket.assignedAgentId) {
      const assigned = available.find((agent) => agent.id === ticket.assignedAgentId)
      if (assigned) return assigned
    }

    const last = list[list.length - 1] ?? null
    const untried = available.filter((agent) => !list.includes(agent.id))
    const fresh = untried.length > 0 ? untried : available.filter((agent) => agent.id !== last)
    const pool = fresh.length > 0 ? fresh : available

    const load = (agent: ProjectAgent): number =>
      [...active.values()].filter((entry) => entry.agentId === agent.id).length
    return [...pool].sort((a, b) => load(a) - load(b))[0] ?? null
  }

  async function waitForAgent(): Promise<void> {
    if (!waitingLogged) {
      ctx.log({
        message: 'Warte auf einen freien Agenten — alle sind gestoppt',
        phase: 'work',
      })
      waitingLogged = true
    }
    await sleep(AGENT_WAIT_MS, ctx.signal)
  }

  // --- Ausführung ----------------------------------------------------------

  /** `false` heißt nur: gerade ist kein Agent frei. Das Ticket bleibt unangetastet. */
  function start(ticket: Ticket): boolean {
    const agent = chooseAgent(ticket)
    if (!agent) return false

    const attempt = (attempts[ticket.id] ?? 0) + 1
    const current = tickets.update(ticket.id, { status: 'in_progress', assignedAgentId: agent.id })
    workset.set(current.id, current)
    tried[current.id] = [...(tried[current.id] ?? []), agent.id]
    active.set(current.id, { agentId: agent.id, promise: execute(current, agent, attempt) })
    waitingLogged = false

    ctx.log({
      message:
        attempt === 1
          ? `Ticket #${current.number} „${current.title}" wird bearbeitet`
          : `Ticket #${current.number} „${current.title}" wird erneut bearbeitet (Versuch ${attempt})`,
      phase: 'work',
      agentId: agent.id,
      ticketId: current.id,
    })
    saveCheckpoint()
    return true
  }

  async function execute(ticket: Ticket, agent: ProjectAgent, attempt: number): Promise<Outcome> {
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
          attempt,
          lastComment: attempt > 1 ? lastComment(ticket.id) : null,
        }),
        label: 'goal-worker',
        ticketId: ticket.id,
        chatLine: workerChatLine(ticket),
        signal: ctx.signal,
        onRateLimit: reportRateLimit(ctx, 'work', agent.id, `Ticket #${ticket.number}`),
        onActivity: reportActivity(goal.id, agent.id, ticket.id),
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

  /** Die letzte Begründung am Ticket — sie erspart dem nächsten Agenten denselben Irrweg. */
  function lastComment(ticketId: string): string | null {
    const comments = listTicketComments(ticketId)
    return comments[comments.length - 1]?.content ?? null
  }

  // --- Ergebnisse ----------------------------------------------------------

  function handle(outcome: Outcome): void {
    active.delete(outcome.ticketId)
    const ticket = workset.get(outcome.ticketId)
    if (!ticket) return

    // Nach einem Abbruch ist nichts mehr zu bewerten — das Ticket bleibt schlicht offen.
    if (ctx.signal.aborted && outcome.kind !== 'done') {
      reopen(ticket.id)
      return
    }

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
        registerAttempt(ticket, outcome.agentId, outcome.message)
    }
  }

  /**
   * Ein Lauf ohne `done` ist ein verbrauchter Versuch, kein Urteil: das Ticket geht zurück
   * in die Warteschlange und beim nächsten Mal an einen anderen Agenten.
   */
  function registerAttempt(ticket: Ticket, agentId: string, message: string): void {
    const count = (attempts[ticket.id] ?? 0) + 1
    attempts[ticket.id] = count
    reopen(ticket.id)

    if (count >= MAX_ATTEMPTS && everyAgentTried(ticket.id)) {
      markStuck(ticket, agentId, `${message} — ${count} Versuche mit allen freigegebenen Agenten`)
      return
    }

    ctx.log({
      message: `${message} — Versuch ${count} von ${MAX_ATTEMPTS}, das Ticket geht zurück in die Warteschlange`,
      phase: 'work',
      agentId,
      ticketId: ticket.id,
      status: 'failed',
    })
  }

  function markStuck(ticket: Ticket, agentId: string | null, reason: string): void {
    stuck.add(ticket.id)
    reopen(ticket.id)
    ctx.log({
      message: `Ticket #${ticket.number} „${ticket.title}" bleibt vorerst liegen: ${reason}. Die Arbeitsphase läuft mit den übrigen Tickets weiter.`,
      phase: 'work',
      agentId,
      ticketId: ticket.id,
      status: 'failed',
    })
  }

  function handleBlocked(ticket: Ticket, outcome: Outcome): void {
    const number = outcome.blockingTicketNumber
    const blocking = number === null ? null : getTicketByNumber(projectId, number)

    if (!blocking || blocking.id === ticket.id) {
      registerAttempt(
        ticket,
        outcome.agentId,
        `Ticket #${ticket.number} meldet eine Blockade ohne gültiges Ticket`,
      )
      return
    }

    if (!workset.has(blocking.id)) {
      workset.set(blocking.id, blocking)
      if (blocking.goalId !== goal.id) tickets.update(blocking.id, { goalId: goal.id })
      if (blocking.status === 'done') done.add(blocking.id)
      ctx.log({
        message: `Ticket #${blocking.number} „${blocking.title}" kommt als Vorbedingung dazu`,
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
      markStuck(
        ticket,
        outcome.agentId,
        `nach ${MAX_REQUEUES} Wiedervorlagen immer noch auf #${blocking.number} wartend`,
      )
      return
    }

    ctx.log({
      message: `Ticket #${ticket.number} wartet auf #${blocking.number} (Wiedervorlage ${count})`,
      phase: 'work',
      agentId: outcome.agentId,
      ticketId: ticket.id,
    })
  }

  // --- Verklemmungen -------------------------------------------------------

  /**
   * Nichts ist bereit, aber es ist noch etwas offen. Statt aufzugeben wird die Ursache
   * beseitigt: fehlende Vorbedingungen kommen ins Vorhaben, liegengebliebene bekommen
   * Vorrang, und ein Ringschluss wird an seiner schwächsten Kante aufgetrennt.
   */
  function resolveBlockage(open: readonly Ticket[]): boolean {
    const order = [...open].sort((a, b) => a.number - b.number)

    for (const ticket of order) {
      for (const depId of listDependencies(ticket.id)) {
        const dep = getTicket(depId)
        if (!dep) {
          dropDependency(
            ticket,
            depId,
            `Ticket #${ticket.number} hing an einer Vorbedingung, die es nicht mehr gibt — die Abhängigkeit wurde entfernt`,
          )
          return true
        }
        if (dep.status === 'done' || workset.has(dep.id)) continue

        workset.set(dep.id, dep)
        if (dep.goalId !== goal.id) tickets.update(dep.id, { goalId: goal.id })
        ctx.log({
          message: `Ticket #${dep.number} „${dep.title}" ist Vorbedingung von #${ticket.number} und wurde ins Vorhaben geholt`,
          phase: 'work',
          ticketId: dep.id,
        })
        return true
      }
    }

    for (const ticket of order) {
      for (const depId of listDependencies(ticket.id)) {
        if (!stuck.has(depId) || revived.has(depId)) continue
        const dep = getTicket(depId)
        if (!dep) continue

        stuck.delete(depId)
        revived.add(depId)
        attempts[depId] = 0
        tried[depId] = []
        requeues[depId] = 0
        ctx.log({
          message: `Vorbedingung #${dep.number} „${dep.title}" lag liegen und bekommt Vorrang — sie blockiert Ticket #${ticket.number}`,
          phase: 'work',
          ticketId: dep.id,
        })
        return true
      }
    }

    const cycle = findCycle()
    if (cycle) {
      breakCycle(cycle)
      return true
    }
    return false
  }

  /** Erster gefundener Ring in den offenen Abhängigkeiten, als Pfad `a → b → … → a`. */
  function findCycle(): string[] | null {
    const nodes = new Set<string>()
    for (const id of workset.keys()) {
      if (!done.has(id) && getTicket(id)) nodes.add(id)
    }

    const state = new Map<string, 'open' | 'closed'>()
    const path: string[] = []

    const visit = (id: string): string[] | null => {
      state.set(id, 'open')
      path.push(id)
      for (const depId of listDependencies(id)) {
        if (!nodes.has(depId)) continue
        const mark = state.get(depId)
        if (mark === 'open') return path.slice(path.indexOf(depId))
        if (!mark) {
          const cycle = visit(depId)
          if (cycle) return cycle
        }
      }
      path.pop()
      state.set(id, 'closed')
      return null
    }

    for (const id of nodes) {
      if (state.get(id)) continue
      const cycle = visit(id)
      if (cycle) return cycle
    }
    return null
  }

  /** Die Kante mit der geringsten Berechtigung fällt: die des Tickets mit der wenigsten Vorarbeit. */
  function breakCycle(cycle: readonly string[]): void {
    const members = cycle
      .map((id) => workset.get(id) ?? getTicket(id))
      .filter((entry): entry is Ticket => entry !== null && entry !== undefined)
    if (members.length === 0) return

    const openDependencies = (ticket: Ticket): number =>
      listDependencies(ticket.id).filter((id) => getTicket(id)?.status !== 'done').length

    const weakest = [...members].sort(
      (a, b) => openDependencies(a) - openDependencies(b) || a.number - b.number,
    )[0]
    if (!weakest) return

    const index = cycle.indexOf(weakest.id)
    const successorId = cycle[(index + 1) % cycle.length]
    if (!successorId || successorId === weakest.id) return
    const successor = getTicket(successorId)

    const ring = members.map((entry) => `#${entry.number}`).join(' → ')
    dropDependency(
      weakest,
      successorId,
      `Ringschluss aufgelöst: ${ring} → #${members[0]?.number ?? ''} warten gegenseitig aufeinander. ` +
        `Die Abhängigkeit von #${weakest.number} auf #${successor?.number ?? successorId} wurde entfernt, ` +
        'weil dieses Ticket im Ring die wenigsten offenen Vorbedingungen hat.',
    )
  }

  function dropDependency(ticket: Ticket, dependencyId: string, message: string): void {
    const rest = listDependencies(ticket.id).filter((id) => id !== dependencyId)
    tickets.setDependencies(ticket.id, rest)
    ctx.log({ message, phase: 'work', ticketId: ticket.id })
  }

  // --- Abschluss -----------------------------------------------------------

  function reportStuck(open: readonly Ticket[]): void {
    const list = open.map((ticket) => `#${ticket.number} „${ticket.title}"`).join(', ')
    ctx.log({
      message: `Arbeitsphase endet mit ${open.length} liegengebliebenen Ticket(s): ${list}. Sie wurden je bis zu ${MAX_ATTEMPTS} Mal mit allen freigegebenen Agenten versucht.`,
      phase: 'work',
      status: 'failed',
    })
  }

  function reportUnresolved(open: readonly Ticket[]): void {
    const list = open
      .map((ticket) => {
        const blockers = listDependencies(ticket.id)
          .map((id) => getTicket(id))
          .filter((entry): entry is Ticket => entry !== null && entry.status !== 'done')
          .map((entry) => `#${entry.number}`)
        return `#${ticket.number} „${ticket.title}" wartet auf ${blockers.join(', ') || 'nichts Auffindbares'}`
      })
      .join('; ')
    ctx.log({
      message: `Arbeitsphase endet: ${list}. Die Vorbedingungen sind liegengeblieben und ließen sich nicht weiter einplanen.`,
      phase: 'work',
      status: 'failed',
    })
  }

  function reopen(ticketId: string): void {
    const ticket = getTicket(ticketId)
    if (!ticket || ticket.status === 'done') return
    if (ticket.status === 'open') {
      workset.set(ticket.id, ticket)
      return
    }
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
      attempts,
      triedAgents: tried,
      stuckTicketIds: [...stuck],
      revivedTicketIds: [...revived],
    })
  }
}

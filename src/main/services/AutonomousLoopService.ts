import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { LocalDatabase } from '../LocalDatabase'
import { ChatOrchestrator, RateLimitError, AgentStoppedError } from '../ChatOrchestrator'
import { log } from '../Logger'
import { IpcChannel } from '@shared/ipc-channels'
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_EFFORT } from '@shared/constants'
import type { ProjectGoal, GoalPhase, GoalStatus, GoalErrorType, GoalCheckpoint, GoalRunLog, Project, ProjectAgent, GlobalAgent, Ticket, TicketStatus } from '@shared/types'

const MAX_RETRY_LOOPS = 3
const MAX_CONCURRENT_WORKERS = 3
const MAX_RATE_LIMIT_RETRIES = 10
/** Max times a single ticket may be requeued because a worker reported it blocked, before giving up. */
const MAX_TICKET_REQUEUES = 3

/** Result of working a single ticket in the selected-mode queue. */
type WorkerOutcome =
  | { kind: 'done' }
  | { kind: 'blocked_by'; blockingNumber: number }
  | { kind: 'failed'; reason: string }

// Agent definitions for auto-creation
const DIETMAR_AGENT: Omit<GlobalAgent, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Dietmar',
  title: 'Pflichtenheft-Agent',
  mentionKey: '@dietmar',
  color: '#7C3AED',
  systemPrompt: `Du bist ein erfahrener technischer Analyst. Du erhältst ein Vorhaben vom Nutzer und erstellst daraus ein strukturiertes Pflichtenheft auf Deutsch.

Das Pflichtenheft muss folgende Abschnitte enthalten:
1. Zieldefinition
2. Ist-Zustand (was existiert bereits)
3. Soll-Zustand (was soll erreicht werden)
4. Funktionale Anforderungen (nummerierte Liste, FA-01, FA-02, ...)
5. Nicht-funktionale Anforderungen (Performance, Sicherheit, UX)
6. Technische Rahmenbedingungen
7. Offene Fragen / Risiken

Speichere das fertige Dokument mit:
[DOC_SAVE: Pflichtenheft - {Titel}]...[/DOC_SAVE]

Antworte ausschließlich mit dem Pflichtenheft-Dokument, kein Smalltalk.`,
}

const MATTHIAS_AGENT: Omit<GlobalAgent, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Matthias',
  title: 'Projektmanager',
  mentionKey: '@matthias',
  color: '#0891B2',
  systemPrompt: `Du bist ein erfahrener Projektmanager. Du erhältst ein Pflichtenheft und erstellst daraus präzise Tickets für das Entwicklungsteam.

Für jedes Ticket verwende das Format:
[TICKET_CREATE: Titel | Kategorie]
Beschreibung des Tickets. Was genau soll implementiert werden?
Akzeptanzkriterien:
- Kriterium 1
- Kriterium 2
Zugewiesener Agent: Name
[/TICKET_CREATE]

Kategorien: bug | feature | task | improvement | documentation

Regeln:
- Erstelle atomare Tickets (ein Ticket = eine abgeschlossene Aufgabe)
- Weise jedes Ticket dem fachlich passenden Agenten zu
- Jedes Ticket braucht klare Akzeptanzkriterien
- Priorisiere: zuerst Basis-Infrastruktur, dann Features, dann Feinschliff
- Maximal 15 Tickets pro Pflichtenheft
- Antworte NUR mit den Ticket-Blöcken, kein weiterer Text`,
}

export class AutonomousLoopService {
  private db: LocalDatabase
  private chatOrchestrator: ChatOrchestrator
  private mainWindow: BrowserWindow | null = null
  private activeGoalAbortControllers: Map<number, AbortController> = new Map()

  constructor(db: LocalDatabase, chatOrchestrator: ChatOrchestrator) {
    this.db = db
    this.chatOrchestrator = chatOrchestrator
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  // ── Entry Point ──────────────────────────────────────────────────────────

  async startGoal(projectId: string, description: string, selectedAgentIds?: string[]): Promise<ProjectGoal> {
    const title = description.length > 60 ? description.substring(0, 57) + '...' : description
    const goal = this.db.saveGoal(projectId, title, description, selectedAgentIds)

    log('info', `[Goal] Started goal #${goal.id}: "${title}"`)

    // Set initial phase before launching
    this.db.updateGoalStatus(goal.id, 'planning', 'pflichtenheft')
    this.pushGoalUpdate(goal.id)

    this.launchStateMachine(goal.id)
    return goal
  }

  /**
   * Start a Vorhaben from a set of hand-picked existing tickets.
   * Skips the Pflichtenheft/ticket-creation phases and goes straight to work,
   * processing the tickets with runtime dependency handling.
   */
  async startSelectedTicketsGoal(projectId: string, ticketIds: string[], selectedAgentIds?: string[]): Promise<ProjectGoal> {
    const tickets = ticketIds
      .map((id) => this.db.getTicket(id))
      .filter((t): t is Ticket => !!t && t.projectId === projectId)

    if (tickets.length === 0) throw new Error('Keine gültigen Tickets ausgewählt')

    const title = `Vorhaben: ${tickets.length} Ticket${tickets.length === 1 ? '' : 's'}`
    const description = tickets.map((t) => `#${t.ticketNumber} ${t.title}`).join(', ')
    const goal = this.db.saveGoal(projectId, title, description, selectedAgentIds, 'selected')

    // Link selected tickets to this goal so they group together and show live status.
    for (const t of tickets) {
      this.db.setTicketGoalId(t.id, goal.id)
    }

    log('info', `[Goal] Started selected-tickets goal #${goal.id} with ${tickets.length} ticket(s)`)

    // Skip Pflichtenheft/ticket_creation — go straight to the work phase.
    this.db.updateGoalStatus(goal.id, 'in_progress', 'ticket_work')
    this.pushGoalUpdate(goal.id)

    this.launchStateMachine(goal.id)
    return goal
  }

  cancelGoal(goalId: number): void {
    const controller = this.activeGoalAbortControllers.get(goalId)
    if (controller) {
      controller.abort()
      this.activeGoalAbortControllers.delete(goalId)
    }

    this.chatOrchestrator.killProcessesForGoal(goalId)

    this.db.updateGoalStatus(goalId, 'cancelled')
    this.pushGoalUpdate(goalId)
    const logEntry = this.db.addGoalRunLog(goalId, this.getCurrentPhase(goalId), 'Vorhaben abgebrochen', undefined, undefined, 'failed')
    this.pushLogEntry(logEntry)

    log('info', `[Goal] Cancelled goal #${goalId}`)
    this.sendPhaseUpdate(goalId, 'done', 'failed', 'Vorhaben abgebrochen')
  }

  async retryGoal(goalId: number): Promise<ProjectGoal | null> {
    const goal = this.db.getGoal(goalId)
    if (!goal || goal.status !== 'failed') return null

    const phase = goal.currentPhase || 'pflichtenheft'
    const status = this.phaseToStatus(phase)

    this.db.clearGoalError(goalId)
    this.db.updateGoalStatus(goalId, status, phase)
    this.pushGoalUpdate(goalId)

    const logEntry = this.db.addGoalRunLog(goalId, phase, `Vorhaben wird erneut gestartet (Phase: ${phase})`)
    this.pushLogEntry(logEntry)

    log('info', `[Goal] Retrying goal #${goalId} from phase: ${phase}`)
    this.launchStateMachine(goalId)

    return this.db.getGoal(goalId)
  }

  // ── Crash Recovery ───────────────────────────────────────────────────────

  async resumeInterruptedGoals(): Promise<void> {
    const activeGoals = this.db.getActiveGoals()
    if (activeGoals.length === 0) return

    log('info', `[Goal] Found ${activeGoals.length} interrupted goal(s), resuming...`)

    for (const goal of activeGoals) {
      if (!goal.currentPhase) {
        // Pre-V13 goal without checkpoint — mark as failed
        this.db.updateGoalWithError(goal.id, 'failed', 'unknown', 'Vorhaben nach App-Neustart abgebrochen (kein Checkpoint)')
        this.db.addGoalRunLog(goal.id, 'pflichtenheft', 'Vorhaben nach App-Neustart abgebrochen (kein Checkpoint)', undefined, undefined, 'failed')
        this.pushGoalUpdate(goal.id)
        continue
      }

      // Check rate limit checkpoint
      if (goal.checkpointData?.rateLimitResumeAt) {
        const resumeAt = new Date(goal.checkpointData.rateLimitResumeAt).getTime()
        const waitMs = Math.max(0, resumeAt - Date.now())
        if (waitMs > 0) {
          log('info', `[Goal] Goal #${goal.id} waiting ${Math.ceil(waitMs / 1000)}s for rate limit before resume`)
          await this.sleep(waitMs)
        }
        this.db.updateGoalCheckpoint(goal.id, null)
      }

      log('info', `[Goal] Resuming goal #${goal.id} from phase: ${goal.currentPhase}`)
      const logEntry = this.db.addGoalRunLog(goal.id, goal.currentPhase, `Vorhaben wird nach Neustart fortgesetzt (Phase: ${goal.currentPhase})`)
      this.pushLogEntry(logEntry)

      this.launchStateMachine(goal.id)
    }
  }

  // ── State Machine ────────────────────────────────────────────────────────

  private launchStateMachine(goalId: number): void {
    const abortController = new AbortController()
    this.activeGoalAbortControllers.set(goalId, abortController)

    this.runStateMachine(goalId, abortController.signal).catch((err) => {
      if (String(err).includes('Goal cancelled')) return
      const errorType = this.classifyError(err)
      const reason = String(err)
      log('error', `[Goal] Fatal error in goal #${goalId}: ${reason}`)
      this.failGoal(goalId, errorType, reason)
    }).finally(() => {
      this.activeGoalAbortControllers.delete(goalId)
    })
  }

  private async runStateMachine(goalId: number, signal: AbortSignal): Promise<void> {
    // Ensure required agents exist
    const initialGoal = this.db.getGoal(goalId)
    if (!initialGoal) throw new Error(`Goal ${goalId} not found`)
    const project = this.chatOrchestrator.getProject(initialGoal.projectId)
    if (!project) throw new Error(`Project ${initialGoal.projectId} not found`)
    // Dietmar/Matthias are only needed for the AI pipeline (Pflichtenheft + ticket creation).
    if (initialGoal.mode !== 'selected') {
      await this.ensureAgentsExist(project)
    }

    while (true) {
      if (signal.aborted) throw new Error('Goal cancelled')

      const goal = this.db.getGoal(goalId)
      if (!goal) throw new Error(`Goal ${goalId} not found`)
      if (['done', 'cancelled', 'failed'].includes(goal.status)) return

      const phase = goal.currentPhase || 'pflichtenheft'

      // Refresh project for latest agents
      this.chatOrchestrator.loadProjects()
      const freshProject = this.chatOrchestrator.getProject(goal.projectId)
      if (!freshProject) throw new Error(`Project ${goal.projectId} not found`)

      switch (phase) {
        case 'pflichtenheft':
          await this.runPflichtenheftPhase(goal, freshProject, signal)
          this.transitionTo(goalId, 'ticket_creation', 'planning')
          break

        case 'ticket_creation':
          await this.runTicketCreationPhase(goal, freshProject, signal)
          this.transitionTo(goalId, 'ticket_work', 'in_progress')
          break

        case 'ticket_work':
          if (goal.mode === 'selected') {
            // Selected-ticket Vorhaben: work the picked tickets, then finish (no PM review).
            await this.runQueuedWorkPhase(goal, freshProject, signal)
            this.transitionTo(goalId, 'done', 'done')
            this.sendToRenderer(IpcChannel.GOAL_COMPLETE, { goalId: goal.id, summary: 'Alle ausgewählten Tickets abgearbeitet' })
            log('info', `[Goal] Selected-tickets goal #${goal.id} completed`)
            return
          }
          await this.runWorkPhase(goal, freshProject, signal)
          this.transitionTo(goalId, 'review', 'reviewing')
          break

        case 'review': {
          const isComplete = await this.runReviewPhase(goal, freshProject, signal)
          if (isComplete) {
            this.transitionTo(goalId, 'done', 'done')
            this.sendToRenderer(IpcChannel.GOAL_COMPLETE, { goalId: goal.id, summary: 'Alle Aufgaben erfolgreich abgeschlossen' })
            log('info', `[Goal] Goal #${goal.id} completed successfully`)
            return
          }
          if (goal.retryCount < MAX_RETRY_LOOPS) {
            this.db.incrementGoalRetry(goal.id)
            this.transitionTo(goalId, 'ticket_work', 'in_progress')
            log('info', `[Goal] Goal #${goal.id} retry ${goal.retryCount + 1}/${MAX_RETRY_LOOPS}`)
          } else {
            this.failGoal(goalId, 'max_retries', `Maximale Anzahl an Review-Zyklen (${MAX_RETRY_LOOPS}) erreicht`)
            return
          }
          break
        }

        case 'done':
          return
      }
    }
  }

  private transitionTo(goalId: number, phase: GoalPhase, status: GoalStatus): void {
    this.db.updateGoalStatus(goalId, status, phase)
    if (status === 'done') {
      this.db.updateGoalCheckpoint(goalId, null)
      this.db.setGoalCompleted(goalId)
    }
    this.pushGoalUpdate(goalId)
    this.sendPhaseUpdate(goalId, phase, status === 'done' ? 'success' : 'running',
      phase === 'done' ? 'Alle Aufgaben erfolgreich abgeschlossen' : `Phase: ${phase}`)
  }

  // ── Phase 1: Pflichtenheft ───────────────────────────────────────────────

  private async runPflichtenheftPhase(goal: ProjectGoal, project: Project, signal: AbortSignal): Promise<void> {
    const logEntry = this.db.addGoalRunLog(goal.id, 'pflichtenheft', 'Pflichtenheft wird erstellt...', 'Dietmar')
    this.pushLogEntry(logEntry)
    this.sendPhaseUpdate(goal.id, 'pflichtenheft', 'running', 'Pflichtenheft wird erstellt...')

    const dietmar = project.agents.find((a) => a.name === 'Dietmar')
    if (!dietmar) throw new Error('Dietmar agent not found in project')

    const docs = this.db.getDocumentsByProject(project.id)
    const docsContext = docs.length > 0
      ? docs.map((d) => `Dokument "${d.title}":\n${d.content.substring(0, 500)}`).join('\n\n')
      : 'Keine existierenden Dokumente.'

    const prompt = `Erstelle ein vollständiges Pflichtenheft für folgendes Vorhaben:\n\n${goal.description}\n\nProjektkontext:\n${docsContext}`

    await this.runAgentForGoal(project, dietmar, prompt, goal.id, signal)

    if (signal.aborted) throw new Error('Goal cancelled')

    // Find the Pflichtenheft document created by this goal run
    const allDocs = this.db.getDocumentsByProject(project.id)
    const pflichtenheftCandidates = allDocs
      .filter((d) => d.title.toLowerCase().startsWith('pflichtenheft'))
      .filter((d) => new Date(d.createdAt) >= new Date(goal.createdAt))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const pflichtenheft = pflichtenheftCandidates[0]
    if (pflichtenheft) {
      this.db.updateGoalPflichtenheft(goal.id, pflichtenheft.id)
    }

    this.db.updateGoalRunLog(logEntry.id, 'success', 'Pflichtenheft erstellt')
    this.pushLogEntry({ ...logEntry, status: 'success', message: 'Pflichtenheft erstellt' })
    this.sendPhaseUpdate(goal.id, 'pflichtenheft', 'success', 'Pflichtenheft erstellt')
    log('info', `[Goal] Phase 1 (Pflichtenheft) completed for goal #${goal.id}`)
  }

  // ── Phase 2: Ticket Creation ─────────────────────────────────────────────

  private async runTicketCreationPhase(goal: ProjectGoal, project: Project, signal: AbortSignal): Promise<void> {
    const logEntry = this.db.addGoalRunLog(goal.id, 'ticket_creation', 'Tickets werden erstellt...', 'Matthias')
    this.pushLogEntry(logEntry)
    this.sendPhaseUpdate(goal.id, 'ticket_creation', 'running', 'Tickets werden erstellt...')

    const matthias = project.agents.find((a) => a.name === 'Matthias')
    if (!matthias) throw new Error('Matthias agent not found in project')

    // Load Pflichtenheft content
    let pflichtenheftContent = goal.description
    const freshGoal = this.db.getGoal(goal.id)
    if (freshGoal?.pflichtenheftDocumentId) {
      const doc = this.db.getDocument(freshGoal.pflichtenheftDocumentId)
      if (doc) pflichtenheftContent = doc.content
    } else {
      const docs = this.db.getDocumentsByProject(project.id)
      const pflichtenheft = docs
        .filter((d) => d.title.toLowerCase().startsWith('pflichtenheft'))
        .filter((d) => new Date(d.createdAt) >= new Date(goal.createdAt))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      if (pflichtenheft) pflichtenheftContent = pflichtenheft.content
    }

    // Build agent list for Matthias
    const selectedIds = goal.selectedAgentIds
    const workerAgents = project.agents
      .filter((a) => a.name !== 'Matthias' && a.name !== 'Dietmar')
      .filter((a) => !selectedIds || selectedIds.length === 0 || selectedIds.includes(a.globalAgentId ?? a.id))
      .map((a) => `${a.name} (${a.title || 'Agent'})`)
      .join(', ')

    const existingGoalTickets = this.db.getTicketsByGoal(goal.id)
    const existingTitles = new Set(existingGoalTickets.map((t) => t.title.toLowerCase().trim()))
    const ticketIdsBefore = new Set(this.db.getTicketsByProject(project.id).map((t) => t.id))

    const prompt = `Lies das folgende Pflichtenheft und erstelle alle notwendigen Tickets:\n\n${pflichtenheftContent}\n\nVerfügbare Agenten im Projekt: ${workerAgents || 'Keine Worker-Agenten verfügbar'}${
      existingGoalTickets.length > 0
        ? `\n\nBereits existierende Tickets (NICHT erneut erstellen!):\n${existingGoalTickets.map((t) => `- #${t.ticketNumber}: ${t.title}`).join('\n')}`
        : ''
    }`

    await this.runAgentForGoal(project, matthias, prompt, goal.id, signal)

    if (signal.aborted) throw new Error('Goal cancelled')

    // Link newly created tickets to this goal
    const allTicketsAfter = this.db.getTicketsByProject(project.id)
    let linkedCount = 0
    for (const ticket of allTicketsAfter) {
      if (!ticketIdsBefore.has(ticket.id) && !ticket.goalId) {
        if (existingTitles.has(ticket.title.toLowerCase().trim())) {
          log('info', `[Goal] Skipping duplicate ticket "${ticket.title}" for goal #${goal.id}`)
          continue
        }
        this.db.setTicketGoalId(ticket.id, goal.id)
        linkedCount++
      }
    }

    this.db.updateGoalRunLog(logEntry.id, 'success', `${linkedCount} Tickets erstellt`)
    this.pushLogEntry({ ...logEntry, status: 'success', message: `${linkedCount} Tickets erstellt` })
    this.sendPhaseUpdate(goal.id, 'ticket_creation', 'success', `${linkedCount} Tickets erstellt`)
    log('info', `[Goal] Phase 2 (Ticket Creation) completed: ${linkedCount} tickets for goal #${goal.id}`)
  }

  // ── Phase 3: Worker Execution ────────────────────────────────────────────

  private async runWorkPhase(goal: ProjectGoal, project: Project, signal: AbortSignal): Promise<void> {
    this.sendPhaseUpdate(goal.id, 'ticket_work', 'running', 'Tickets werden abgearbeitet...')

    const goalTickets = this.db.getTicketsByGoal(goal.id)
    const checkpoint = goal.checkpointData
    const completedIds = new Set(checkpoint?.completedTicketIds || [])
    const openTickets = goalTickets.filter((t) =>
      (t.status === 'open' || t.status === 'in_progress') && !completedIds.has(t.id)
    )

    if (openTickets.length === 0) {
      log('info', `[Goal] No open tickets for goal #${goal.id}, skipping work phase`)
      return
    }

    const chunks = this.chunkArray(openTickets, MAX_CONCURRENT_WORKERS)
    let completedCount = completedIds.size

    for (const chunk of chunks) {
      if (signal.aborted) throw new Error('Goal cancelled')

      await Promise.all(
        chunk.map(async (ticket) => {
          if (signal.aborted) return

          const worker = this.resolveWorkerAgent(ticket, project.agents, goal.selectedAgentIds)
          if (!worker) {
            log('warn', `[Goal] No worker agent found for ticket #${ticket.ticketNumber}`)
            return
          }
          // Respect the per-agent stop switch — leave the ticket open for a later run.
          if (this.chatOrchestrator.isAgentStopped(project.id, worker.id)) {
            log('info', `[Goal] Ticket #${ticket.ticketNumber} skipped — ${worker.name} ist gestoppt`)
            const skipLog = this.db.addGoalRunLog(goal.id, 'ticket_work', `Ticket #${ticket.ticketNumber} übersprungen — ${worker.name} ist gestoppt`, worker.name, ticket.id, 'failed')
            this.pushLogEntry(skipLog)
            return
          }

          const logEntry = this.db.addGoalRunLog(goal.id, 'ticket_work', `Ticket #${ticket.ticketNumber} wird bearbeitet...`, worker.name, ticket.id)
          this.pushLogEntry(logEntry)

          try {
            const workerPrompt = this.buildWorkerPrompt(ticket, project, goal)
            await this.runAgentForGoal(project, worker, workerPrompt, goal.id, signal, `Arbeite Ticket #${ticket.ticketNumber} ("${ticket.title}") ab.`, ticket.id)
            completedCount++

            // Update checkpoint after each ticket
            completedIds.add(ticket.id)
            this.db.updateGoalCheckpoint(goal.id, { completedTicketIds: Array.from(completedIds) })

            this.db.updateGoalRunLog(logEntry.id, 'success', `Ticket #${ticket.ticketNumber} bearbeitet`)
            this.pushLogEntry({ ...logEntry, status: 'success', message: `Ticket #${ticket.ticketNumber} bearbeitet` })
          } catch (err) {
            if (String(err).includes('Goal cancelled')) throw err
            this.db.updateGoalRunLog(logEntry.id, 'failed', `Fehler bei Ticket #${ticket.ticketNumber}: ${err}`)
            this.pushLogEntry({ ...logEntry, status: 'failed', message: `Fehler bei Ticket #${ticket.ticketNumber}: ${err}` })
            log('error', `[Goal] Worker failed on ticket #${ticket.ticketNumber}: ${err}`)
          }

          this.sendPhaseUpdate(goal.id, 'ticket_work', 'running', `${completedCount}/${openTickets.length + completedIds.size - completedCount} Tickets bearbeitet`)
        })
      )
    }

    // Clear work-phase checkpoint
    this.db.updateGoalCheckpoint(goal.id, null)

    this.sendPhaseUpdate(goal.id, 'ticket_work', 'success', `${completedCount} Tickets bearbeitet`)
    log('info', `[Goal] Phase 3 (Work) completed: ${completedCount} tickets for goal #${goal.id}`)
  }

  // ── Selected-Mode Work Phase: worker pool with runtime dependencies ───────

  /**
   * Works the goal's tickets with up to MAX_CONCURRENT_WORKERS in parallel.
   * Independent tickets run concurrently; when a worker reports a ticket needs
   * another one done first ([BLOCKED_BY: #X]), that ticket is requeued, #X is
   * pulled in / prioritised, and the blocked ticket resumes once #X is done.
   */
  private async runQueuedWorkPhase(goal: ProjectGoal, project: Project, signal: AbortSignal): Promise<void> {
    this.sendPhaseUpdate(goal.id, 'ticket_work', 'running', 'Tickets werden abgearbeitet...')

    type WorkState = 'pending' | 'active' | 'done' | 'failed'
    const state = new Map<string, WorkState>()
    const ticketsById = new Map<string, Ticket>()
    const idByNumber = new Map<number, string>()
    const deps = new Map<string, Set<string>>()
    const requeues = new Map<string, number>()

    const register = (t: Ticket): void => {
      ticketsById.set(t.id, t)
      idByNumber.set(t.ticketNumber, t.id)
      state.set(t.id, t.status === 'done' ? 'done' : 'pending')
      deps.set(t.id, new Set(this.db.getTicketDependencies(t.id)))
    }

    for (const t of this.db.getTicketsByGoal(goal.id)) register(t)
    // Drop dependency links pointing at tickets outside the working set (until pulled in).
    for (const set of deps.values()) {
      for (const dep of [...set]) if (!ticketsById.has(dep)) set.delete(dep)
    }

    const isBlockerForOthers = (id: string): boolean => {
      for (const set of deps.values()) if (set.has(id)) return true
      return false
    }

    const pickReady = (): string | null => {
      const ready = [...ticketsById.keys()].filter((id) => {
        if (state.get(id) !== 'pending') return false
        for (const dep of deps.get(id)!) {
          if (state.get(dep) !== 'done') return false
        }
        return true
      })
      if (ready.length === 0) return null
      // Prioritise blockers (tickets others depend on), then by ticket number.
      ready.sort((a, b) => {
        const ba = isBlockerForOthers(a) ? 0 : 1
        const bb = isBlockerForOthers(b) ? 0 : 1
        if (ba !== bb) return ba - bb
        return ticketsById.get(a)!.ticketNumber - ticketsById.get(b)!.ticketNumber
      })
      return ready[0]
    }

    const activeTicketIds = new Set<string>()
    const active = new Map<string, Promise<{ ticketId: string; outcome: WorkerOutcome }>>()
    const logEntries = new Map<string, GoalRunLog>()

    const startWorker = (ticketId: string): void => {
      const ticket = ticketsById.get(ticketId)!
      state.set(ticketId, 'active')
      activeTicketIds.add(ticketId)
      this.setTicketStatus(ticket, 'in_progress')
      this.updateActiveCheckpoint(goal.id, activeTicketIds)

      const worker = this.resolveWorkerAgent(ticket, project.agents, goal.selectedAgentIds)
      const logEntry = this.db.addGoalRunLog(goal.id, 'ticket_work', `Ticket #${ticket.ticketNumber} wird bearbeitet...`, worker?.name, ticket.id)
      logEntries.set(ticketId, logEntry)
      this.pushLogEntry(logEntry)
      this.sendPhaseUpdate(goal.id, 'ticket_work', 'running', this.describeActive(activeTicketIds, ticketsById))

      const promise = this.workOnTicket(ticket, worker, project, goal, ticketsById, signal)
        .then((outcome) => ({ ticketId, outcome }))
      active.set(ticketId, promise)
    }

    while (true) {
      if (signal.aborted) throw new Error('Goal cancelled')

      // Fill free worker slots with ready tickets.
      while (active.size < MAX_CONCURRENT_WORKERS) {
        const next = pickReady()
        if (!next) break
        startWorker(next)
      }

      if (active.size === 0) {
        // Nothing running and nothing ready → remaining pending tickets are deadlocked.
        const stuck = [...ticketsById.keys()].filter((id) => state.get(id) === 'pending')
        for (const id of stuck) {
          state.set(id, 'failed')
          const t = ticketsById.get(id)!
          this.setTicketStatus(t, 'open')
          const le = this.db.addGoalRunLog(goal.id, 'ticket_work', `Ticket #${t.ticketNumber} blockiert: Abhängigkeit nicht auflösbar`, undefined, t.id, 'failed')
          this.pushLogEntry(le)
        }
        break
      }

      const { ticketId, outcome } = await Promise.race(active.values())
      active.delete(ticketId)
      activeTicketIds.delete(ticketId)
      const ticket = ticketsById.get(ticketId)!
      const logEntry = logEntries.get(ticketId)!

      if (outcome.kind === 'done') {
        state.set(ticketId, 'done')
        this.setTicketStatus(ticket, 'done')
        this.finishLog(logEntry, 'success', `Ticket #${ticket.ticketNumber} bearbeitet`)
      } else if (outcome.kind === 'blocked_by') {
        const depId = this.resolveDependencyTarget(outcome.blockingNumber, idByNumber, project)
        const n = (requeues.get(ticketId) ?? 0) + 1
        requeues.set(ticketId, n)

        if (!depId || depId === ticketId) {
          state.set(ticketId, 'failed')
          this.setTicketStatus(ticket, 'open')
          this.finishLog(logEntry, 'failed', `Ticket #${ticket.ticketNumber} blockiert: benötigtes Ticket #${outcome.blockingNumber} nicht gefunden`)
        } else if (n > MAX_TICKET_REQUEUES) {
          state.set(ticketId, 'failed')
          this.setTicketStatus(ticket, 'open')
          this.finishLog(logEntry, 'failed', `Ticket #${ticket.ticketNumber} wiederholt blockiert (#${outcome.blockingNumber}) — übersprungen`)
        } else {
          // Pull the blocker into the working set if it isn't there yet.
          if (!ticketsById.has(depId)) {
            const pulled = this.db.getTicket(depId)
            if (pulled) {
              register(pulled)
              for (const dep of [...deps.get(pulled.id)!]) if (!ticketsById.has(dep)) deps.get(pulled.id)!.delete(dep)
              this.db.setTicketGoalId(pulled.id, goal.id)
              this.setTicketStatus(pulled, pulled.status)
            }
          }
          this.db.addTicketDependency(ticketId, depId)
          deps.get(ticketId)!.add(depId)
          state.set(ticketId, 'pending')
          this.setTicketStatus(ticket, 'open')
          this.finishLog(logEntry, 'success', `Ticket #${ticket.ticketNumber} wartet auf #${outcome.blockingNumber}`)
        }
      } else {
        state.set(ticketId, 'failed')
        this.setTicketStatus(ticket, 'open')
        this.finishLog(logEntry, 'failed', `Ticket #${ticket.ticketNumber}: ${outcome.reason}`)
      }

      this.updateActiveCheckpoint(goal.id, activeTicketIds)
    }

    this.db.updateGoalCheckpoint(goal.id, null)

    const doneCount = [...state.values()].filter((s) => s === 'done').length
    const failedCount = [...state.values()].filter((s) => s === 'failed').length
    this.sendPhaseUpdate(goal.id, 'ticket_work', failedCount > 0 ? 'failed' : 'success',
      `${doneCount} erledigt${failedCount > 0 ? `, ${failedCount} blockiert` : ''}`)
    log('info', `[Goal] Selected work phase done for goal #${goal.id}: ${doneCount} done, ${failedCount} failed`)
  }

  /** Runs a single ticket through its assigned worker and classifies the result. */
  private async workOnTicket(
    ticket: Ticket,
    worker: ProjectAgent | null,
    project: Project,
    goal: ProjectGoal,
    siblings: Map<string, Ticket>,
    signal: AbortSignal,
  ): Promise<WorkerOutcome> {
    if (!worker) return { kind: 'failed', reason: 'Kein passender Agent gefunden' }
    // Respect the per-agent stop switch before spending anything on this ticket.
    if (this.chatOrchestrator.isAgentStopped(project.id, worker.id)) {
      return { kind: 'failed', reason: `${worker.name} ist gestoppt` }
    }
    try {
      const prompt = this.buildWorkerPrompt(ticket, project, goal, [...siblings.values()])
      const response = await this.runAgentForGoal(project, worker, prompt, goal.id, signal, `Arbeite Ticket #${ticket.ticketNumber} ("${ticket.title}") ab.`, ticket.id)

      // Explicit dependency signal — the ticket needs another one done first.
      const blockedMatch = response.match(/\[BLOCKED_BY:\s*#?(\d+)\]/i)
      if (blockedMatch) {
        return { kind: 'blocked_by', blockingNumber: parseInt(blockedMatch[1], 10) }
      }

      // Unsolvable block reported for this ticket ("#N blockiert: ...").
      const blockRe = new RegExp(`#${ticket.ticketNumber}\\b[^\\n]*blockiert`, 'i')
      if (blockRe.test(response)) {
        const reasonMatch = response.match(/blockiert:?\s*([^\n]+)/i)
        return { kind: 'failed', reason: (reasonMatch ? reasonMatch[1].trim() : 'blockiert').slice(0, 200) }
      }

      return { kind: 'done' }
    } catch (err) {
      if (String(err).includes('Goal cancelled')) throw err
      // Stopped mid-run — the ticket is unfinished, so it must go back to 'open', not 'done'.
      if (err instanceof AgentStoppedError) {
        return { kind: 'failed', reason: `${worker.name} wurde gestoppt — Ticket bleibt offen` }
      }
      return { kind: 'failed', reason: String(err).slice(0, 200) }
    }
  }

  /** Map a referenced ticket number to a ticket id, pulling from the project if needed. */
  private resolveDependencyTarget(blockingNumber: number, idByNumber: Map<number, string>, project: Project): string | null {
    const known = idByNumber.get(blockingNumber)
    if (known) return known
    const t = this.db.getTicketByNumber(project.id, blockingNumber)
    return t ? t.id : null
  }

  private setTicketStatus(ticket: Ticket, status: TicketStatus): void {
    if (ticket.status !== status) {
      this.db.updateTicket(ticket.id, { status })
      this.db.addToSyncQueue('ticket', ticket.id, 'update', { id: ticket.id, status })
      ticket.status = status
    }
    const updated = this.db.getTicket(ticket.id)
    if (updated) this.sendToRenderer(IpcChannel.TICKET_UPDATE, { type: 'updated', ticket: updated })
  }

  private updateActiveCheckpoint(goalId: number, activeTicketIds: Set<string>): void {
    const goal = this.db.getGoal(goalId)
    const cp = goal?.checkpointData || {}
    this.db.updateGoalCheckpoint(goalId, { ...cp, activeTicketIds: Array.from(activeTicketIds) })
    this.pushGoalUpdate(goalId)
  }

  private describeActive(activeTicketIds: Set<string>, ticketsById: Map<string, Ticket>): string {
    const nums = Array.from(activeTicketIds).map((id) => `#${ticketsById.get(id)?.ticketNumber ?? '?'}`)
    return nums.length ? `Aktiv: ${nums.join(', ')}` : 'Tickets werden abgearbeitet...'
  }

  private finishLog(logEntry: GoalRunLog, status: 'success' | 'failed', message: string): void {
    this.db.updateGoalRunLog(logEntry.id, status, message)
    this.pushLogEntry({ ...logEntry, status, message })
  }

  // ── Phase 4: PM Review ───────────────────────────────────────────────────

  private async runReviewPhase(goal: ProjectGoal, project: Project, signal: AbortSignal): Promise<boolean> {
    const logEntry = this.db.addGoalRunLog(goal.id, 'review', 'PM-Review läuft...', 'Matthias')
    this.pushLogEntry(logEntry)
    this.sendPhaseUpdate(goal.id, 'review', 'running', 'PM-Review läuft...')

    const matthias = project.agents.find((a) => a.name === 'Matthias')
    if (!matthias) throw new Error('Matthias agent not found')

    // Load Pflichtenheft
    let pflichtenheftContent = goal.description
    const freshGoal = this.db.getGoal(goal.id)
    if (freshGoal?.pflichtenheftDocumentId) {
      const doc = this.db.getDocument(freshGoal.pflichtenheftDocumentId)
      if (doc) pflichtenheftContent = doc.content
    }

    // Build ticket summaries
    const goalTickets = this.db.getTicketsByGoal(goal.id)
    const doneTickets = goalTickets.filter((t) => t.status === 'done')
    const blockedTickets = goalTickets.filter((t) => t.description?.toLowerCase().includes('blockiert'))
    const openTickets = goalTickets.filter((t) => t.status === 'open' || t.status === 'in_progress')

    const doneList = doneTickets.map((t) => {
      const lastComment = t.comments.length > 0 ? t.comments[t.comments.length - 1].content.substring(0, 200) : 'Keine Kommentare'
      return `#${t.ticketNumber} - ${t.title} - ${lastComment}`
    }).join('\n')

    const blockedList = blockedTickets.map((t) =>
      `#${t.ticketNumber} - ${t.title} - ${t.description?.substring(0, 200) ?? 'Kein Grund angegeben'}`
    ).join('\n')

    const openList = openTickets.map((t) => `#${t.ticketNumber} - ${t.title}`).join('\n')

    // Snapshot for deduplication
    const existingTitles = new Set(goalTickets.map((t) => t.title.toLowerCase().trim()))
    const ticketIdsBefore = new Set(this.db.getTicketsByProject(project.id).map((t) => t.id))

    const prompt = [
      `Überprüfe alle abgeschlossenen Tickets des Projekts und bewerte ob das Ziel erreicht wurde.`,
      ``,
      `Ursprüngliches Ziel: ${goal.description}`,
      ``,
      `Pflichtenheft:`,
      pflichtenheftContent,
      ``,
      doneList ? `Abgeschlossene Tickets:\n${doneList}` : 'Keine abgeschlossenen Tickets.',
      ``,
      blockedList ? `Blockierte Tickets:\n${blockedList}` : '',
      openList ? `Noch offene Tickets:\n${openList}` : '',
      ``,
      `Bewerte anhand von Code und Ticket-Dokumentation. Führe KEINE Test-Suites und keine vollständigen Builds aus — das kostet zu viel Zeit und Ressourcen.`,
      ``,
      `WICHTIG: Erstelle NUR dann ein neues Fix-Ticket, wenn das Problem noch NICHT durch ein bestehendes Ticket abgedeckt ist.`,
      `Alle existierenden Tickets dieses Vorhabens: ${goalTickets.map((t) => `#${t.ticketNumber} "${t.title}" (${t.status})`).join(', ')}`,
      ``,
      `Für jedes Ticket das NICHT akzeptiert werden kann und für das noch KEIN Fix-Ticket existiert:`,
      `[TICKET_CREATE: Fix: {{original title}} | bug]`,
      `Was genau fehlt oder falsch ist.`,
      `Zugewiesener Agent: Dimitri`,
      `[/TICKET_CREATE]`,
      ``,
      `Wenn ALLE Anforderungen erfüllt sind, schreibe abschließend:`,
      `[GOAL_COMPLETE: {{kurze Zusammenfassung was erreicht wurde}}]`,
      ``,
      `Wenn noch Nachbesserungen nötig sind:`,
      `[GOAL_RETRY: {{Anzahl neue Tickets}} neue Tickets erstellt]`,
    ].filter(Boolean).join('\n')

    const response = await this.runAgentForGoal(project, matthias, prompt, goal.id, signal)

    if (signal.aborted) throw new Error('Goal cancelled')

    // Parse GOAL_COMPLETE
    const goalCompleteMatch = response.match(/\[GOAL_COMPLETE:\s*(.+?)\]/s)
    if (goalCompleteMatch) {
      const summary = goalCompleteMatch[1].trim()
      this.db.updateGoalRunLog(logEntry.id, 'success', `Ziel erreicht: ${summary}`)
      this.pushLogEntry({ ...logEntry, status: 'success', message: `Ziel erreicht: ${summary}` })
      this.sendToRenderer(IpcChannel.GOAL_COMPLETE, { goalId: goal.id, summary })
      this.sendPhaseUpdate(goal.id, 'review', 'success', `Ziel erreicht: ${summary}`)
      log('info', `[Goal] Goal #${goal.id} completed: ${summary}`)
      return true
    }

    // Parse GOAL_RETRY
    const goalRetryMatch = response.match(/\[GOAL_RETRY:\s*(.+?)\]/s)
    if (goalRetryMatch) {
      const allTicketsAfter = this.db.getTicketsByProject(project.id)
      let newLinked = 0
      for (const ticket of allTicketsAfter) {
        if (!ticketIdsBefore.has(ticket.id) && !ticket.goalId) {
          if (existingTitles.has(ticket.title.toLowerCase().trim())) continue
          this.db.setTicketGoalId(ticket.id, goal.id)
          newLinked++
        }
      }
      this.db.updateGoalRunLog(logEntry.id, 'success', `Nachbesserungen nötig: ${goalRetryMatch[1]}`)
      this.pushLogEntry({ ...logEntry, status: 'success', message: `Nachbesserungen nötig: ${goalRetryMatch[1]}` })
      this.sendPhaseUpdate(goal.id, 'review', 'success', `Nachbesserungen nötig — neuer Zyklus`)
      log('info', `[Goal] Goal #${goal.id} needs retry: ${goalRetryMatch[1]} (${newLinked} new tickets linked)`)
      return false
    }

    // No explicit marker — fall back to ticket status check
    const refreshedTickets = this.db.getTicketsByGoal(goal.id)
    const doneCount = refreshedTickets.filter((t) => t.status === 'done').length
    const totalCount = refreshedTickets.length
    const allDone = totalCount > 0 && doneCount === totalCount

    if (allDone) {
      const summary = `Alle ${totalCount} Tickets erledigt (implizit abgeschlossen)`
      this.db.updateGoalRunLog(logEntry.id, 'success', summary)
      this.pushLogEntry({ ...logEntry, status: 'success', message: summary })
      this.sendToRenderer(IpcChannel.GOAL_COMPLETE, { goalId: goal.id, summary })
      this.sendPhaseUpdate(goal.id, 'review', 'success', summary)
      log('info', `[Goal] Goal #${goal.id} implicitly completed: all ${totalCount} tickets done`)
      return true
    }

    const reason = `PM-Review ohne Ergebnis-Marker — ${doneCount}/${totalCount} Tickets erledigt`
    this.db.updateGoalRunLog(logEntry.id, 'failed', reason)
    this.pushLogEntry({ ...logEntry, status: 'failed', message: reason })
    this.sendPhaseUpdate(goal.id, 'review', 'failed', `${reason} — Retry`)
    return false
  }

  // ── Agent Execution ──────────────────────────────────────────────────────

  /**
   * Runs an agent for a goal phase. When `displayLabel` is given, the CHAT shows only that short
   * line (e.g. "Arbeite Ticket #1 ab") while the agent still receives the full `prompt` as a
   * transient promptOverride — so the ticket body is not duplicated into the chat history.
   */
  private async runAgentForGoal(
    project: Project,
    agent: ProjectAgent,
    prompt: string,
    goalId: number,
    signal: AbortSignal,
    displayLabel?: string,
    ticketId?: string,
  ): Promise<string> {
    let rateLimitRetries = 0

    while (rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
      if (signal.aborted) throw new Error('Goal cancelled')

      const messageContent = `${agent.mentionKey} ${displayLabel ?? prompt}`
      const promptOverride = displayLabel ? prompt : undefined
      const messageIdsBefore = new Set(
        this.db.getMessagesByProject(project.id, 500).map((m) => m.id)
      )

      // ticket_id scopes the Claude session per ticket so workers don't inherit each other's
      // transcripts (see ChatOrchestrator.buildClaudeScopeKey).
      const runMetadata: Record<string, string> = { triggered_by: 'goal_loop', goal_id: String(goalId) }
      if (ticketId) runMetadata.ticket_id = ticketId

      try {
        await this.chatOrchestrator.handleUserMessage(
          project.id,
          messageContent,
          undefined,
          undefined,
          runMetadata,
          promptOverride,
        )
      } catch (err) {
        if (err instanceof RateLimitError) {
          rateLimitRetries++
          const baseWaitMs = err.retryAfterMs || 60000
          const backoffMs = baseWaitMs * Math.min(rateLimitRetries, 3)
          const waitMin = Math.ceil(backoffMs / 60000)

          log('warn', `[Goal] Rate limit hit for goal #${goalId}, waiting ${waitMin}min (retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`)
          this.sendPhaseUpdate(goalId, this.getCurrentPhase(goalId), 'running',
            `Rate limit — Pause ${waitMin} Min. (${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`)

          // Persist rate limit checkpoint for crash recovery
          const resumeAt = new Date(Date.now() + backoffMs).toISOString()
          this.db.updateGoalCheckpoint(goalId, { rateLimitResumeAt: resumeAt })

          // Use setTimeout instead of busy-wait
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, backoffMs)
            const onAbort = () => { clearTimeout(timer); reject(new Error('Goal cancelled')) }
            signal.addEventListener('abort', onAbort, { once: true })
          })

          this.db.updateGoalCheckpoint(goalId, null)
          log('info', `[Goal] Rate limit wait done, resuming goal #${goalId}`)
          this.sendPhaseUpdate(goalId, this.getCurrentPhase(goalId), 'running', 'Wird fortgesetzt...')
          continue
        }
        throw err
      }

      if (signal.aborted) throw new Error('Goal cancelled')

      // Find new agent responses
      const messagesAfter = this.db.getMessagesByProject(project.id, 500)
      const agentResponses = messagesAfter
        .filter((m) => m.role === 'agent' && m.agentLocalId === agent.id)
        .filter((m) => !messageIdsBefore.has(m.id))

      if (agentResponses.length > 0) {
        const lastResponse = agentResponses[agentResponses.length - 1]
        let result = lastResponse.content
        if (lastResponse.metadata?.goal_complete) {
          result += `\n[GOAL_COMPLETE: ${lastResponse.metadata.goal_complete}]`
        }
        if (lastResponse.metadata?.goal_retry) {
          result += `\n[GOAL_RETRY: ${lastResponse.metadata.goal_retry}]`
        }
        return result
      }

      log('warn', `[Goal] No response found from agent ${agent.name} for goal #${goalId}`)
      return ''
    }

    throw new Error(`Rate limit: Maximale Anzahl an Wiederholungen (${MAX_RATE_LIMIT_RETRIES}) erreicht`)
  }

  // ── Error Handling ───────────────────────────────────────────────────────

  private classifyError(err: unknown): GoalErrorType {
    if (err instanceof RateLimitError) return 'rate_limit'
    const msg = String(err).toLowerCase()
    if (msg.includes('not found')) return 'agent_not_found'
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout'
    if (msg.includes('max') && msg.includes('retri')) return 'max_retries'
    return 'unknown'
  }

  private failGoal(goalId: number, errorType: GoalErrorType, errorMessage: string): void {
    this.db.updateGoalWithError(goalId, 'failed', errorType, errorMessage)
    const logEntry = this.db.addGoalRunLog(goalId, this.getCurrentPhase(goalId), `Fehler: ${errorMessage}`, undefined, undefined, 'failed')
    this.pushLogEntry(logEntry)
    this.sendToRenderer(IpcChannel.GOAL_FAILED, { goalId, reason: errorMessage, errorType })
    this.pushGoalUpdate(goalId)
    log('error', `[Goal] Goal #${goalId} failed (${errorType}): ${errorMessage}`)
  }

  // ── Agent Auto-Creation ──────────────────────────────────────────────────

  private async ensureAgentsExist(project: Project): Promise<void> {
    const globalAgents = this.db.getAllGlobalAgents()
    await this.ensureSingleAgent(project, globalAgents, DIETMAR_AGENT)
    await this.ensureSingleAgent(project, globalAgents, MATTHIAS_AGENT)

    this.chatOrchestrator.loadProjects()
    const fresh = this.chatOrchestrator.getProject(project.id)
    if (fresh) {
      project.agents = fresh.agents
    }
  }

  private async ensureSingleAgent(
    project: Project,
    globalAgents: GlobalAgent[],
    agentDef: Omit<GlobalAgent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const now = new Date().toISOString()

    let globalAgent = globalAgents.find((a) => a.name === agentDef.name)
    if (!globalAgent) {
      globalAgent = {
        ...agentDef,
        model: agentDef.model ?? DEFAULT_AGENT_MODEL,
        effort: agentDef.effort ?? DEFAULT_AGENT_EFFORT,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      this.db.saveGlobalAgent(globalAgent)
      log('info', `[Goal] Auto-created global agent: ${agentDef.name}`)
    }

    const inProject = project.agents.some((a) => a.name === agentDef.name)
    if (!inProject) {
      const projectAgent: ProjectAgent = {
        id: randomUUID(),
        projectId: project.id,
        globalAgentId: globalAgent.id,
        name: globalAgent.name,
        title: globalAgent.title,
        mentionKey: globalAgent.mentionKey,
        systemPrompt: globalAgent.systemPrompt,
        color: globalAgent.color,
        avatar: globalAgent.avatar,
        // Inherit the global agent's model + effort — never leave them NULL, or the agent would
        // resolve to the defaults at runtime without that ever being a deliberate choice.
        model: globalAgent.model ?? DEFAULT_AGENT_MODEL,
        effort: globalAgent.effort ?? DEFAULT_AGENT_EFFORT,
        sortOrder: 0,
        status: 'idle',
      }
      this.db.saveAgent(project.id, projectAgent)
      project.agents.push(projectAgent)
      log('info', `[Goal] Added ${agentDef.name} to project ${project.name}`)
    }
  }

  // ── Worker Resolution ────────────────────────────────────────────────────

  private resolveWorkerAgent(ticket: Ticket, agents: ProjectAgent[], selectedAgentIds?: string[]): ProjectAgent | null {
    const eligibleAgents = agents
      .filter((a) => a.name !== 'Matthias' && a.name !== 'Dietmar')
      .filter((a) => !selectedAgentIds || selectedAgentIds.length === 0 || selectedAgentIds.includes(a.globalAgentId ?? a.id))

    // Parse "Zugewiesener Agent: Name" from ticket description
    const assignMatch = ticket.description?.match(/Zugewiesener Agent:\s*(\w+)/i)
    if (assignMatch) {
      const name = assignMatch[1].toLowerCase()
      const found = eligibleAgents.find((a) => a.name.toLowerCase() === name)
      if (found) return found
    }

    if (ticket.assignedAgentName) {
      const found = eligibleAgents.find((a) => a.name.toLowerCase() === ticket.assignedAgentName!.toLowerCase())
      if (found) return found
    }

    const uwe = eligibleAgents.find((a) => a.name.toLowerCase() === 'uwe')
    if (uwe) return uwe

    return eligibleAgents[0] ?? null
  }

  private buildWorkerPrompt(ticket: Ticket, project: Project, goal: ProjectGoal, siblings?: Ticket[]): string {
    // The autonomous (goal_loop) path builds a MINIMAL prompt in ChatOrchestrator.runAgent —
    // it does NOT inject getTicketsSummaryForAgent (that only happens for interactive chat).
    // So this prompt is the worker's ONLY source of ticket context and MUST be self-contained:
    // it has to carry the ticket body and the sibling list itself.
    let pflichtenheftContext = ''
    const freshGoal = this.db.getGoal(goal.id)
    if (freshGoal?.pflichtenheftDocumentId) {
      const doc = this.db.getDocument(freshGoal.pflichtenheftDocumentId)
      if (doc) {
        // Truncate to first 2000 chars — enough context without burning tokens
        pflichtenheftContext = doc.content.length > 2000
          ? doc.content.substring(0, 2000) + '\n[... gekürzt]'
          : doc.content
      }
    }

    const otherTickets = (siblings ?? []).filter((s) => s.id !== ticket.id)
    const siblingList = otherTickets.length > 0
      ? otherTickets.map((s) => `#${s.ticketNumber}: ${s.title} (${s.status === 'done' ? 'erledigt' : 'offen'})`).join('\n')
      : ''

    return [
      `Du arbeitest autonom an einem Ticket. Erledige die Aufgabe vollständig.`,
      ``,
      `Ticket #${ticket.ticketNumber}: ${ticket.title}`,
      ticket.category ? `Kategorie: ${ticket.category}` : '',
      ``,
      `Beschreibung:`,
      ticket.description || 'Keine Beschreibung.',
      ``,
      pflichtenheftContext ? `Pflichtenheft (Kontext):\n${pflichtenheftContext}\n` : '',
      siblingList ? `Weitere Tickets in diesem Vorhaben:\n${siblingList}\n` : '',
      `Regeln:`,
      `- Arbeite die Akzeptanzkriterien vollständig ab`,
      `- Dokumentiere was du gemacht hast`,
      `- Wenn du fertig bist, setze das Ticket auf erledigt: #${ticket.ticketNumber} erledigt`,
      siblingList
        ? `- WICHTIG: Falls dieses Ticket zwingend voraussetzt, dass zuerst ein anderes, noch offenes Ticket aus der Liste oben erledigt wird, antworte NUR mit [BLOCKED_BY: #NUMMER] plus einer kurzen Begründung und arbeite NICHT weiter. Das System erledigt dann zuerst das andere Ticket und startet dieses danach erneut.`
        : '',
      `- Wenn du auf ein Problem stößt, das du nicht lösen kannst, schreibe: #${ticket.ticketNumber} blockiert: {Grund}`,
      `- Erstelle KEINE neuen Tickets — konzentriere dich nur auf dieses eine Ticket`,
      `- Führe KEINE Test-Suites und keine vollständigen Builds aus (npm test, jest, pytest, npm run build o.ä.) — das kostet zu viel Zeit und Ressourcen. Zum Absichern reicht der günstigste Weg, z.B. ein Typecheck der geänderten Datei. Tests nur dann, wenn das Ticket sie ausdrücklich verlangt.`,
      `- Kein Smalltalk, nur Ergebnisse`,
      ``,
      `Langzeit-Gedächtnis:`,
      `Du behältst Wissen über dieses Repo über Vorhaben hinweg. Wenn du beim Arbeiten etwas`,
      `Dauerhaftes über den Aufbau lernst, das dir das nächste Mal die Suche erspart, halte es fest:`,
      `[MEMORY_SAVE: kurzer-schlüssel | die Erkenntnis in einem Satz | 1-3]`,
      `(3 = zentral für fast jede Aufgabe, 2 = oft nützlich, 1 = Randnotiz)`,
      `- Speichere nur STABILE Fakten: Architektur, Verzeichnis-Aufbau, Konventionen, Build-/Test-Befehle, wiederkehrende Fallstricke.`,
      `- Speichere NICHT: was du in diesem Ticket geändert hast, Ticket-Status, Tagesaktuelles.`,
      `- Höchstens 3 Einträge pro Ticket. Nichts speichern ist besser als Rauschen.`,
      `- Steht die Erkenntnis oben schon im Gedächtnis-Block, speichere sie NICHT erneut.`,
    ].filter(Boolean).join('\n')
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  private getCurrentPhase(goalId: number): GoalPhase {
    const goal = this.db.getGoal(goalId)
    return goal?.currentPhase || 'pflichtenheft'
  }

  private phaseToStatus(phase: GoalPhase): GoalStatus {
    switch (phase) {
      case 'pflichtenheft': return 'planning'
      case 'ticket_creation': return 'planning'
      case 'ticket_work': return 'in_progress'
      case 'review': return 'reviewing'
      case 'done': return 'done'
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  // ── Event Pushing ────────────────────────────────────────────────────────

  private pushGoalUpdate(goalId: number): void {
    const goal = this.db.getGoal(goalId)
    if (goal) this.sendToRenderer(IpcChannel.GOAL_STATUS_UPDATE, goal)
  }

  private pushLogEntry(logEntry: GoalRunLog): void {
    this.sendToRenderer(IpcChannel.GOAL_LOG_UPDATE, { goalId: logEntry.goalId, log: logEntry })
  }

  private sendToRenderer(channel: string, data: unknown): void {
    this.mainWindow?.webContents.send(channel, data)
  }

  private sendPhaseUpdate(goalId: number, phase: GoalPhase, status: 'running' | 'success' | 'failed', message: string): void {
    this.sendToRenderer(IpcChannel.GOAL_PHASE_UPDATE, { goalId, phase, status, message })
  }
}

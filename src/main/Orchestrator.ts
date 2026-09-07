import { BrowserWindow, ipcMain, dialog } from 'electron'
import { randomUUID, randomInt } from 'crypto'
import { EventEmitter } from 'events'
import { spawn, execFile } from 'child_process'
import { claudeProcessManager, ClaudeProcessManager } from './ClaudeProcessManager'
import { backendConnection, BackendConnection } from './BackendConnection'
import { localDatabase } from './LocalDatabase'
import { SyncService } from './SyncService'
import { ChatOrchestrator } from './ChatOrchestrator'
import { attachmentStorage } from './AttachmentStorage'
import { OrchestratorState, IncomingMessage, OutgoingMessage, StoredSettings, Project, ProjectAgent, GlobalAgent, Ticket, TicketComment, ProjectDocument, AgentMemory, ProjectGoal, Rating, RatingPeriod, RatingStayType, MessageAttachment } from '@shared/types'
import { MemoryService } from './services/MemoryService'
import { AutonomousLoopService } from './services/AutonomousLoopService'
import { IpcChannel } from '@shared/ipc-channels'
import { validateTicketImport, planTicketImport, type ImportResult } from '@shared/ticketImport'
import { APP_VERSION, DEFAULT_AGENT_MODEL, DEFAULT_AGENT_EFFORT } from '@shared/constants'
import { log, setLogCallback, getLogEntries } from './Logger'
import { getSettings, saveSettings, getToken, getBackendUrl } from './StoreManager'

// ── Types ───────────────────────────────────────────────────────────────────

interface ActiveSession {
  agentId: string
  sessionId: string
  abortController: AbortController
  startedAt: Date
  outputBuffer: string
  status: 'running' | 'completed' | 'error' | 'stopped'
}

// ── Class ───────────────────────────────────────────────────────────────────

export class Orchestrator extends EventEmitter {
  private activeSessions: Map<string, ActiveSession> = new Map()
  private state: OrchestratorState
  private mainWindow: BrowserWindow | null = null
  private lastConnectedAt: string | null = null
  private syncService: SyncService
  private chatOrchestrator: ChatOrchestrator
  private memoryService: MemoryService
  private autonomousLoopService: AutonomousLoopService

  constructor(
    private claude: ClaudeProcessManager = claudeProcessManager,
    private backend: BackendConnection = backendConnection,
  ) {
    super()
    this.syncService = new SyncService(localDatabase)
    this.chatOrchestrator = new ChatOrchestrator(localDatabase, this.syncService)
    this.memoryService = new MemoryService(localDatabase)
    this.autonomousLoopService = new AutonomousLoopService(localDatabase, this.chatOrchestrator)
    this.state = this.buildState()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    log('info', 'Orchestrator initializing...')

    // Initialize local database
    localDatabase.initialize()
    attachmentStorage.initialize()
    this.chatOrchestrator.initialize()

    // Wire up the BackendConnection state callback so it can send current state on connect
    this.backend.getOrchestratorState = () => this.getState()

    // Register all event handlers
    this.wireClaudeEvents()
    this.wireBackendEvents()
    this.registerIpcHandlers()
    this.registerChatIpcHandlers()
    this.registerTicketIpcHandlers()
    this.registerDocumentIpcHandlers()
    this.registerMemoryIpcHandlers()
    this.registerGoalIpcHandlers()
    this.registerRatingIpcHandlers()
    this.registerEmailVerificationIpcHandlers()
    this.wireSyncEvents()

    // Forward log entries to renderer
    setLogCallback((entry) => {
      this.mainWindow?.webContents.send(IpcChannel.LOG_UPDATE, entry)
    })

    // Auto-connect if credentials are stored
    const settings = getSettings()
    if (settings.userToken && settings.backendUrl) {
      log('info', 'Found stored credentials, auto-connecting...')
      await this.connect(settings.backendUrl, settings.userToken)
    }

    log('info', 'Orchestrator initialized')
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
    this.chatOrchestrator.setMainWindow(win)
    this.autonomousLoopService.setMainWindow(win)

    // Resume any goals that were interrupted by app restart
    this.autonomousLoopService.resumeInterruptedGoals().catch((err) => {
      log('error', `[Goal] Failed to resume interrupted goals: ${err}`)
    })
  }

  async connect(backendUrl: string, token: string): Promise<void> {
    // Validate backend URL
    if (!/^(wss?|https?):\/\/.+/.test(backendUrl)) {
      const msg = 'Invalid backend URL. Must start with https:// or wss://'
      log('error', msg)
      throw new Error(msg)
    }

    // Validate token
    if (!token || token.trim().length === 0) {
      const msg = 'Token must not be empty'
      log('error', msg)
      throw new Error(msg)
    }

    // Persist credentials
    saveSettings({ backendUrl, userToken: token })

    // Start Claude process if not already running
    if (!this.claude.isRunning()) {
      log('info', 'Starting Claude Code CLI...')
      await this.claude.start()
    }

    // Connect to backend (validates token first, then opens WebSocket)
    log('info', `Connecting to backend: ${backendUrl}`)
    await this.backend.connect(backendUrl, token)

    // Initialize sync service with backend credentials
    this.syncService.initialize(backendUrl, token)

    this.broadcastStateUpdate()
  }

  disconnect(): void {
    log('info', 'Disconnecting...')

    // Stop all active sessions first
    this.stopAllSessions('Orchestrator disconnecting')

    // Disconnect backend
    this.backend.disconnect()

    // Stop Claude process
    this.claude.stop()

    // Clear stored credentials so UI returns to login
    saveSettings({ backendUrl: '', userToken: '' })

    this.broadcastStateUpdate()
  }

  getState(): OrchestratorState {
    return this.buildState()
  }

  destroy(): void {
    log('info', 'Orchestrator shutting down...')
    this.stopAllSessions('Orchestrator shutting down')
    this.syncService.stop()
    localDatabase.close()
    this.claude.stop()
    this.backend.destroy()
  }

  // ── Event Wiring: Claude Process ────────────────────────────────────────

  private wireClaudeEvents(): void {
    this.claude.on('ready', () => {
      log('info', 'Claude Code CLI is ready')
      this.state.claudeRunning = true
      this.broadcastStateUpdate()
    })

    this.claude.on('output', (output: { type: string; content?: string; session_id?: string;[key: string]: unknown }) => {
      this.handleClaudeOutput(output)
    })

    this.claude.on('raw-output', (text: string) => {
      log('debug', `Claude raw output: ${text.substring(0, 200)}`)
    })

    this.claude.on('error', (message: string) => {
      log('error', `Claude error: ${message}`)
    })

    this.claude.on('crashed', (exitCode: number) => {
      log('error', `Claude process crashed with exit code ${exitCode}`)
      this.state.claudeRunning = false

      // Notify backend about all running sessions failing
      this.activeSessions.forEach((session) => {
        if (session.status === 'running') {
          session.status = 'error'
          this.backend.send({
            type: 'error',
            agentId: session.agentId,
            sessionId: session.sessionId,
            error: `Claude Code crashed (exit code ${exitCode})`,
            timestamp: Date.now(),
          })
        }
      })

      this.activeSessions.clear()
      this.broadcastStateUpdate()
    })

    this.claude.on('stopped', () => {
      log('info', 'Claude Code CLI stopped')
      this.state.claudeRunning = false
      this.broadcastStateUpdate()
    })

    this.claude.on('fatal-error', (message: string) => {
      log('error', `Claude fatal error: ${message}`)
      this.state.claudeRunning = false

      // Fail all active sessions
      this.activeSessions.forEach((session) => {
        if (session.status === 'running') {
          session.status = 'error'
          this.backend.send({
            type: 'error',
            agentId: session.agentId,
            sessionId: session.sessionId,
            error: message,
            timestamp: Date.now(),
          })
        }
      })

      this.activeSessions.clear()
      this.broadcastStateUpdate()
    })
  }

  // ── Event Wiring: Backend Connection ────────────────────────────────────

  private wireBackendEvents(): void {
    this.backend.on('connected', () => {
      log('info', 'Backend connected')
      this.state.connected = true
      this.lastConnectedAt = new Date().toISOString()
      this.broadcastStateUpdate()
    })

    this.backend.on('disconnected', () => {
      log('info', 'Backend disconnected')
      this.state.connected = false
      this.broadcastStateUpdate()
    })

    this.backend.on('message', (msg: IncomingMessage) => {
      this.handleIncomingMessage(msg)
    })

    this.backend.on('status-change', (status: string) => {
      log('debug', `Backend status changed: ${status}`)
      this.broadcastStateUpdate()
    })

    this.backend.on('error', (message: string) => {
      log('error', `Backend error: ${message}`)
    })

    this.backend.on('max-reconnect-reached', () => {
      log('error', 'Backend max reconnect attempts reached. Manual reconnect required.')
      this.broadcastStateUpdate()
    })
  }

  // ── Incoming Message Handler ────────────────────────────────────────────

  private handleIncomingMessage(msg: IncomingMessage): void {
    log('info', `Incoming message: ${msg.type} (session: ${msg.sessionId}, agent: ${msg.agentId})`)

    switch (msg.type) {
      case 'run_agent':
        this.handleRunAgent(msg)
        break

      case 'stop_agent':
        this.handleStopAgent(msg)
        break

      case 'config_update':
        this.handleConfigUpdate(msg)
        break

      // ping is handled directly in BackendConnection
    }

    this.broadcastStateUpdate()
  }

  private handleRunAgent(msg: IncomingMessage): void {
    const { agentId, sessionId, prompt, config } = msg

    // Check if session is already active
    if (this.activeSessions.has(sessionId)) {
      log('warn', `Session ${sessionId} is already active, rejecting duplicate run_agent`)
      this.backend.send({
        type: 'error',
        agentId,
        sessionId,
        error: `Session ${sessionId} is already running`,
        timestamp: Date.now(),
      })
      return
    }

    // Verify Claude is running
    if (!this.claude.isRunning()) {
      log('error', `Cannot run agent: Claude is not running`)
      this.backend.send({
        type: 'error',
        agentId,
        sessionId,
        error: 'Claude Code CLI is not running',
        timestamp: Date.now(),
      })
      return
    }

    // Verify prompt exists
    if (!prompt) {
      log('warn', `run_agent without prompt for session ${sessionId}`)
      this.backend.send({
        type: 'error',
        agentId,
        sessionId,
        error: 'No prompt provided',
        timestamp: Date.now(),
      })
      return
    }

    // Create the session
    const abortController = new AbortController()
    const session: ActiveSession = {
      agentId,
      sessionId,
      abortController,
      startedAt: new Date(),
      outputBuffer: '',
      status: 'running',
    }
    this.activeSessions.set(sessionId, session)

    // Build the full input for Claude
    let input = ''
    if (config?.systemPrompt) {
      input += `[System Context]\n${config.systemPrompt}\n\n[User Request]\n`
    }
    input += prompt

    log('info', `Starting agent ${agentId} for session ${sessionId}`, sessionId)

    // Set up timeout if configured
    if (config?.timeout && config.timeout > 0) {
      const timeoutId = setTimeout(() => {
        const activeSession = this.activeSessions.get(sessionId)
        if (activeSession && activeSession.status === 'running') {
          log('warn', `Session ${sessionId} timed out after ${config.timeout}ms`, sessionId)
          this.abortSession(sessionId, `Timeout after ${config.timeout}ms`)
        }
      }, config.timeout)

      // Clear timeout if session is aborted
      abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId)
      })
    }

    // Send command to Claude
    this.claude.sendCommand(input)
  }

  private handleStopAgent(msg: IncomingMessage): void {
    const { sessionId, agentId } = msg

    const session = this.activeSessions.get(sessionId)
    if (!session) {
      log('warn', `stop_agent: session ${sessionId} not found`)
      this.backend.send({
        type: 'error',
        agentId,
        sessionId,
        error: `Session ${sessionId} not found`,
        timestamp: Date.now(),
      })
      return
    }

    this.abortSession(sessionId, 'Stopped by backend request')
  }

  private handleConfigUpdate(msg: IncomingMessage): void {
    log('info', `Config update received for session ${msg.sessionId}`, msg.sessionId)

    if (msg.config) {
      const session = this.activeSessions.get(msg.sessionId)
      if (session) {
        log('debug', `Config update applied to session ${msg.sessionId}`)
      }
    }
  }

  // ── Claude Output Handler ───────────────────────────────────────────────

  private handleClaudeOutput(output: { type: string; content?: string; session_id?: string;[key: string]: unknown }): void {
    const sessionId = output.session_id
    const session = sessionId ? this.activeSessions.get(sessionId) : null

    // Route based on Claude stream-json output type
    switch (output.type) {
      case 'assistant': {
        // Assistant message chunk with content
        const content = output.content ?? (output.message as string) ?? ''
        if (content && session) {
          session.outputBuffer += content
          this.backend.send({
            type: 'output',
            agentId: session.agentId,
            sessionId: session.sessionId,
            data: content,
            timestamp: Date.now(),
          })
        }
        break
      }

      case 'result': {
        // Agent completed successfully
        if (session) {
          const resultData = output.result as string ?? output.content ?? session.outputBuffer
          session.status = 'completed'
          log('info', `Session ${session.sessionId} completed`, session.sessionId)

          this.backend.send({
            type: 'completed',
            agentId: session.agentId,
            sessionId: session.sessionId,
            data: typeof resultData === 'string' ? resultData : JSON.stringify(resultData),
            timestamp: Date.now(),
          })

          this.activeSessions.delete(session.sessionId)
          this.broadcastStateUpdate()
        }
        break
      }

      case 'error': {
        // Claude reported an error
        const errorMsg = output.error as string ?? output.content ?? 'Unknown Claude error'
        if (session) {
          session.status = 'error'
          log('error', `Session ${session.sessionId} error: ${errorMsg}`, session.sessionId)

          this.backend.send({
            type: 'error',
            agentId: session.agentId,
            sessionId: session.sessionId,
            error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
            timestamp: Date.now(),
          })

          this.activeSessions.delete(session.sessionId)
          this.broadcastStateUpdate()
        } else {
          log('error', `Claude error (no session): ${errorMsg}`)
        }
        break
      }

      case 'system': {
        // System messages from Claude (info, progress, etc.)
        log('debug', `Claude system: ${JSON.stringify(output).substring(0, 200)}`)
        break
      }

      default: {
        // Forward unknown types as output if we have a session
        if (session && output.content) {
          this.backend.send({
            type: 'output',
            agentId: session.agentId,
            sessionId: session.sessionId,
            data: typeof output.content === 'string' ? output.content : JSON.stringify(output.content),
            timestamp: Date.now(),
          })
        }
        break
      }
    }
  }

  // ── Session Management ──────────────────────────────────────────────────

  private abortSession(sessionId: string, reason: string): void {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    log('info', `Aborting session ${sessionId}: ${reason}`, sessionId)

    session.abortController.abort()
    session.status = 'stopped'

    this.backend.send({
      type: 'completed',
      agentId: session.agentId,
      sessionId: session.sessionId,
      data: reason,
      timestamp: Date.now(),
    })

    this.activeSessions.delete(sessionId)
    this.broadcastStateUpdate()
  }

  private stopAllSessions(reason: string): void {
    if (this.activeSessions.size === 0) return

    log('info', `Stopping all ${this.activeSessions.size} active session(s): ${reason}`)

    this.activeSessions.forEach((session) => {
      if (session.status === 'running') {
        session.abortController.abort()
        session.status = 'stopped'

        this.backend.send({
          type: 'error',
          agentId: session.agentId,
          sessionId: session.sessionId,
          error: reason,
          timestamp: Date.now(),
        })
      }
    })

    this.activeSessions.clear()
  }

  // ── State ───────────────────────────────────────────────────────────────

  private buildState(): OrchestratorState {
    return {
      connected: this.backend.connected,
      claudeRunning: this.claude.isRunning(),
      activeSessions: this.activeSessions.size,
      userToken: getToken() ? '***' : null,
      backendUrl: getBackendUrl() || null,
      userEmail: null,
      planName: null,
      lastConnectedAt: this.lastConnectedAt,
      version: APP_VERSION,
    }
  }

  // ── IPC Handlers ────────────────────────────────────────────────────────

  private registerIpcHandlers(): void {
    ipcMain.handle(IpcChannel.GET_STATE, async () => {
      return this.getState()
    })

    ipcMain.handle(IpcChannel.CONNECT, async (_event, { backendUrl, token }: { backendUrl: string; token: string }) => {
      await this.connect(backendUrl, token)
    })

    ipcMain.handle(IpcChannel.DISCONNECT, async () => {
      this.disconnect()
    })

    ipcMain.handle(IpcChannel.GET_LOGS, async () => {
      return getLogEntries()
    })

    ipcMain.handle(IpcChannel.GET_SETTINGS, async () => {
      return getSettings()
    })

    ipcMain.handle(IpcChannel.SAVE_SETTINGS, async (_event, settings: Partial<StoredSettings>) => {
      saveSettings(settings)
      // If claudePath changed, update the process manager
      if (settings.claudePath) {
        log('info', `Claude path updated to: ${settings.claudePath}`)
      }
      return getSettings()
    })

    ipcMain.on(IpcChannel.MINIMIZE_TO_TRAY, () => {
      this.mainWindow?.hide()
    })
  }

  // ── Chat IPC Handlers ──────────────────────────────────────────────────

  private registerChatIpcHandlers(): void {
    ipcMain.handle(IpcChannel.GET_PROJECTS, async () => {
      return this.chatOrchestrator.loadProjects()
    })

    ipcMain.handle(IpcChannel.CREATE_PROJECT, async (_event, data: { name: string; description?: string }) => {
      const project: Project = {
        id: randomUUID(),
        name: data.name,
        description: data.description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agents: [],
      }
      localDatabase.saveProject(project)
      localDatabase.addToSyncQueue('project', project.id, 'create', project)
      this.chatOrchestrator.loadProjects()
      return project
    })

    ipcMain.handle(IpcChannel.UPDATE_PROJECT, async (_event, data: { id: string; name?: string; description?: string; metadata?: Record<string, string> }) => {
      const existing = localDatabase.getProject(data.id)
      if (!existing) throw new Error('Project not found')
      const updated: Project = {
        ...existing,
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        metadata: (data.metadata && Object.keys(data.metadata).length > 0) ? data.metadata : existing.metadata,
        updatedAt: new Date().toISOString(),
        agents: localDatabase.getAgentsByProject(data.id),
      }
      localDatabase.saveProject(updated)
      localDatabase.addToSyncQueue('project', updated.id, 'update', updated)
      this.chatOrchestrator.loadProjects()
      return updated
    })

    ipcMain.handle(IpcChannel.DELETE_PROJECT, async (_event, projectId: string) => {
      localDatabase.deleteProject(projectId)
      localDatabase.addToSyncQueue('project', projectId, 'delete', { id: projectId })
      this.chatOrchestrator.loadProjects()
      return { success: true }
    })

    // ── Global Agents ──────────────────────────────────────────────────────

    ipcMain.handle(IpcChannel.GET_GLOBAL_AGENTS, async () => {
      return localDatabase.getAllGlobalAgents()
    })

    ipcMain.handle(IpcChannel.CREATE_GLOBAL_AGENT, async (_event, agent: Partial<GlobalAgent>) => {
      const now = new Date().toISOString()
      const newAgent: GlobalAgent = {
        id: randomUUID(),
        name: agent.name ?? 'Agent',
        title: agent.title,
        mentionKey: agent.mentionKey ?? '@' + (agent.name ?? 'agent').toLowerCase().replace(/\s+/g, ''),
        systemPrompt: agent.systemPrompt ?? '',
        color: agent.color ?? '#6366f1',
        avatar: agent.avatar,
        model: agent.model ?? DEFAULT_AGENT_MODEL,
        effort: agent.effort ?? DEFAULT_AGENT_EFFORT,
        createdAt: now,
        updatedAt: now,
      }
      localDatabase.saveGlobalAgent(newAgent)
      return newAgent
    })

    ipcMain.handle(IpcChannel.UPDATE_GLOBAL_AGENT, async (_event, { id, updates }: { id: string; updates: Partial<GlobalAgent> }) => {
      let existing = localDatabase.getGlobalAgent(id)

      // If no global agent found, this might be a project_agent id from before migration
      // Create the global agent from the project agent data
      if (!existing) {
        const now = new Date().toISOString()
        existing = {
          id,
          name: updates.name ?? 'Agent',
          title: updates.title,
          mentionKey: updates.mentionKey ?? '@agent',
          systemPrompt: updates.systemPrompt ?? '',
          color: updates.color ?? '#6366f1',
          avatar: updates.avatar,
          model: updates.model ?? DEFAULT_AGENT_MODEL,
          effort: updates.effort ?? DEFAULT_AGENT_EFFORT,
          createdAt: now,
          updatedAt: now,
        }
        localDatabase.saveGlobalAgent(existing)
        // Link the project agent to this new global agent
        localDatabase.linkProjectAgentToGlobal(id, id)
      }

      const updated: GlobalAgent = {
        ...existing,
        ...updates,
        id,
        updatedAt: new Date().toISOString(),
      }
      if (updates.name && !updates.mentionKey) {
        updated.mentionKey = '@' + updates.name.toLowerCase().replace(/\s+/g, '')
      }
      localDatabase.saveGlobalAgent(updated)

      // Update all linked project agents
      localDatabase.updateProjectAgentsByGlobal(id, {
        name: updated.name,
        title: updated.title,
        mentionKey: updated.mentionKey,
        systemPrompt: updated.systemPrompt,
        color: updated.color,
        avatar: updated.avatar,
        model: updated.model,
        effort: updated.effort,
      })
      this.chatOrchestrator.loadProjects()

      return updated
    })

    ipcMain.handle(IpcChannel.DELETE_GLOBAL_AGENT, async (_event, id: string) => {
      localDatabase.deleteGlobalAgent(id)
      this.chatOrchestrator.loadProjects()
      return { success: true }
    })

    // ── Project Agent assignment ────────────────────────────────────────────

    ipcMain.handle(IpcChannel.ADD_AGENT, async (_event, { projectId, agent, globalAgentId }: { projectId: string; agent?: Partial<ProjectAgent>; globalAgentId?: string }) => {
      let newAgent: ProjectAgent

      if (globalAgentId) {
        // Add existing global agent to project
        const global = localDatabase.getGlobalAgent(globalAgentId)
        if (!global) throw new Error('Global agent not found')
        newAgent = {
          id: randomUUID(),
          projectId,
          globalAgentId: global.id,
          name: global.name,
          title: global.title,
          mentionKey: global.mentionKey,
          systemPrompt: global.systemPrompt,
          color: global.color,
          avatar: global.avatar,
          model: global.model,
          effort: global.effort,
          sortOrder: 0,
          status: 'idle',
        }
      } else if (agent) {
        // Create new global agent + add to project
        const now = new Date().toISOString()
        const globalAgent: GlobalAgent = {
          id: randomUUID(),
          name: agent.name ?? 'Agent',
          title: agent.title,
          mentionKey: agent.mentionKey ?? '@' + (agent.name ?? 'agent').toLowerCase().replace(/\s+/g, ''),
          systemPrompt: agent.systemPrompt ?? '',
          color: agent.color ?? '#6366f1',
          avatar: agent.avatar,
          model: agent.model ?? DEFAULT_AGENT_MODEL,
          effort: agent.effort ?? DEFAULT_AGENT_EFFORT,
          createdAt: now,
          updatedAt: now,
        }
        localDatabase.saveGlobalAgent(globalAgent)

        newAgent = {
          id: randomUUID(),
          projectId,
          globalAgentId: globalAgent.id,
          name: globalAgent.name,
          title: globalAgent.title,
          mentionKey: globalAgent.mentionKey,
          systemPrompt: globalAgent.systemPrompt,
          color: globalAgent.color,
          avatar: globalAgent.avatar,
          model: globalAgent.model,
          effort: globalAgent.effort,
          sortOrder: 0,
          status: 'idle',
        }
      } else {
        throw new Error('Either agent data or globalAgentId must be provided')
      }

      localDatabase.saveAgent(projectId, newAgent)
      localDatabase.addToSyncQueue('agent', newAgent.id, 'create', newAgent as unknown as Record<string, unknown>)
      this.chatOrchestrator.loadProjects()
      return newAgent
    })

    ipcMain.handle(IpcChannel.REMOVE_AGENT, async (_event, { projectId, agentId }: { projectId: string; agentId: string }) => {
      localDatabase.deleteAgent(agentId, projectId)
      localDatabase.addToSyncQueue('agent', agentId, 'delete', { id: agentId, projectId })
      this.chatOrchestrator.loadProjects()
      return { success: true }
    })

    ipcMain.handle(IpcChannel.GENERATE_AGENT_PROMPT, async (_event, { skillDescription }: { skillDescription: string }) => {
      const claudePath = await this.claude.detectClaudePath()
      const metaPrompt = [
        'Du bist ein Experte für das Erstellen von System Prompts für KI-Agenten.',
        '',
        'Der Benutzer beschreibt kurz die Fähigkeiten/Skills eines Agenten. Generiere daraus einen professionellen, detaillierten System Prompt auf Deutsch.',
        '',
        'Der System Prompt soll:',
        '- Die Rolle und Persönlichkeit des Agenten klar definieren',
        '- Konkrete Verhaltensregeln und Fähigkeiten beschreiben',
        '- Präzise und strukturiert sein',
        '- Direkt verwendbar sein (kein Erklärungstext drumherum)',
        '',
        'Skill-Beschreibung des Agenten:',
        skillDescription,
        '',
        'Antworte NUR mit dem System Prompt, ohne Anführungszeichen oder zusätzlichen Text.',
      ].join('\n')

      log('info', `[PromptGen] Starting for: "${skillDescription.substring(0, 80)}"`)
      log('info', `[PromptGen] Claude path: ${claudePath}`)

      return new Promise<string>((resolve, reject) => {
        const env = { ...process.env }
        delete env.CLAUDECODE

        const proc = spawn(claudePath, ['-p', '--model', DEFAULT_AGENT_MODEL], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
        })

        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })

        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
          log('warn', `[PromptGen] stderr: ${chunk.toString().substring(0, 200)}`)
        })

        const timeout = setTimeout(() => {
          log('error', '[PromptGen] Timed out after 60s')
          proc.kill('SIGKILL')
          reject(new Error('Prompt-Generierung Timeout nach 60 Sekunden'))
        }, 60000)

        proc.on('error', (err) => {
          clearTimeout(timeout)
          log('error', `[PromptGen] Spawn error: ${err.message}`)
          reject(new Error(`Claude konnte nicht gestartet werden: ${err.message}`))
        })

        proc.on('close', (code) => {
          clearTimeout(timeout)
          log('info', `[PromptGen] Process exited with code ${code}, stdout length: ${stdout.length}, stderr length: ${stderr.length}`)
          if (code !== 0) {
            reject(new Error(stderr || `Claude beendet mit Code ${code}`))
            return
          }
          if (!stdout.trim()) {
            reject(new Error('Claude hat eine leere Antwort zurückgegeben'))
            return
          }
          resolve(stdout.trim())
        })

        // Write prompt to stdin and close immediately to signal EOF
        proc.stdin.end(metaPrompt)
        log('info', '[PromptGen] Prompt written to stdin, waiting for response...')
      })
    })

    ipcMain.handle(IpcChannel.SEND_MESSAGE, async (_event, { projectId, content, replyToLocalId, attachments }: { projectId: string; content: string; replyToLocalId?: string; attachments?: MessageAttachment[] }) => {
      await this.chatOrchestrator.handleUserMessage(projectId, content, replyToLocalId, attachments)
      return { success: true }
    })

    ipcMain.handle(IpcChannel.SAVE_ATTACHMENT, async (_event, { messageId, fileName, mimeType, dataBase64 }: { messageId: string; fileName: string; mimeType: string; dataBase64: string }) => {
      try {
        const data = Buffer.from(dataBase64, 'base64')
        const attachment = attachmentStorage.save({ messageId, fileName, mimeType, data })
        return { success: true, attachment }
      } catch (err) {
        log('error', `SAVE_ATTACHMENT failed: ${(err as Error).message}`)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle(IpcChannel.GET_MESSAGES, async (_event, { projectId, limit, offset }: { projectId: string; limit?: number; offset?: number }) => {
      return localDatabase.getMessagesByProject(projectId, limit ?? 100, offset ?? 0)
    })

    ipcMain.handle(IpcChannel.DELETE_MESSAGE, async (_event, { messageId }: { messageId: string }) => {
      localDatabase.deleteMessage(messageId)
      return { success: true }
    })

    ipcMain.handle(IpcChannel.RETRY_MESSAGE, async (_event, { messageId }: { messageId: string }) => {
      await this.chatOrchestrator.retryMessage(messageId)
      return { success: true }
    })

    ipcMain.handle(IpcChannel.STOP_AGENT_CHAT, async (_event, { messageId }: { messageId: string }) => {
      const stopped = this.chatOrchestrator.stopMessageGeneration(messageId)
      return { success: stopped }
    })

    ipcMain.handle(
      IpcChannel.SET_AGENT_STOPPED,
      async (_event, { projectId, agentId, stopped }: { projectId: string; agentId: string; stopped: boolean }) => {
        const { killed } = this.chatOrchestrator.setAgentStopped(projectId, agentId, stopped)
        return { success: true, killed }
      }
    )

    ipcMain.handle(IpcChannel.GET_SYNC_STATUS, async () => {
      return {
        isOnline: this.syncService.isOnline,
        isSyncing: this.syncService.isSyncing,
        unsyncedCount: localDatabase.getUnsyncedCount(),
        lastSyncAt: this.syncService.lastSyncAt?.toISOString() ?? null,
      }
    })

    ipcMain.handle(IpcChannel.TRIGGER_FULL_SYNC, async () => {
      await this.syncService.fullSync()
      this.chatOrchestrator.loadProjects()
    })

    ipcMain.handle(IpcChannel.EXPORT_PDF, async (_event, { title, htmlContent }: { title: string; htmlContent: string }) => {
      return this.exportDocumentAsPdf(title, htmlContent)
    })

    ipcMain.handle(IpcChannel.PICK_AND_READ_FILE, async (_event, args: { filters?: Electron.FileFilter[] } | undefined) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (!win) return { canceled: true }
      const defaultFilters: Electron.FileFilter[] = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: args?.filters ?? defaultFilters,
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      const filePath = result.filePaths[0]
      const content = fs.readFileSync(filePath, 'utf-8')
      const fileName = path.basename(filePath)
      return { canceled: false, fileName, content }
    })
  }

  // ── PDF Export ───────────────────────────────────────────────────────────

  private async exportDocumentAsPdf(title: string, htmlContent: string): Promise<{ success: boolean; error?: string }> {
    const fs = require('fs') as typeof import('fs')

    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { margin: 25mm 20mm; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.8;
    color: #1a1a1a;
    max-width: 100%;
    padding: 0;
  }
  h1 { font-size: 26px; font-weight: 700; margin: 1.2em 0 0.5em; padding-bottom: 0.3em; border-bottom: 1px solid #e5e7eb; }
  h2 { font-size: 21px; font-weight: 600; margin: 1em 0 0.4em; padding-bottom: 0.25em; border-bottom: 1px solid #f0f0f0; }
  h3 { font-size: 17px; font-weight: 600; margin: 0.8em 0 0.3em; }
  h4 { font-size: 15px; font-weight: 600; margin: 0.7em 0 0.25em; }
  p { margin: 0.6em 0; }
  ul, ol { margin: 0.5em 0; padding-left: 1.8em; }
  li { margin: 0.25em 0; }
  ul li { list-style-type: disc; }
  ol li { list-style-type: decimal; }
  code {
    background: #f4f5f7;
    border: 1px solid #e5e7eb;
    color: #b91c1c;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 13px;
    font-family: 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  }
  pre {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
    margin: 0.8em 0;
    overflow-x: auto;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    color: #1a1a1a;
    font-size: 13px;
  }
  blockquote {
    border-left: 3px solid #6366f1;
    margin: 0.6em 0;
    padding: 10px 14px;
    color: #4b5563;
    background: #fafbfc;
    border-radius: 0 6px 6px 0;
  }
  blockquote p { margin: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.8em 0;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #e5e7eb;
    padding: 8px 12px;
    text-align: left;
  }
  th { background: #f4f5f7; font-weight: 600; }
  tr:nth-child(even) { background: #fafbfc; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.2em 0; }
  a { color: #6366f1; text-decoration: none; }
  strong { font-weight: 600; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1 style="margin-top: 0;">${safeTitle}</h1>
${htmlContent}
</body>
</html>`

    // Create hidden window for PDF rendering
    const pdfWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { offscreen: true },
    })

    try {
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)

      // Wait for CDN script to load and render
      await new Promise((r) => setTimeout(r, 1500))

      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      })

      const { filePath, canceled } = await dialog.showSaveDialog(this.mainWindow!, {
        defaultPath: `${title.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })

      if (canceled || !filePath) return { success: false }

      fs.writeFileSync(filePath, pdfBuffer)
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('error', `PDF export failed: ${msg}`)
      return { success: false, error: msg }
    } finally {
      pdfWindow.close()
    }
  }

  // ── Ticket IPC Handlers ────────────────────────────────────────────────

  private registerTicketIpcHandlers(): void {
    ipcMain.handle(IpcChannel.GET_TICKETS, async (_event, { projectId }: { projectId: string }) => {
      return localDatabase.getTicketsGrouped(projectId)
    })

    ipcMain.handle(IpcChannel.CREATE_TICKET, async (_event, { projectId, title, description, assignedAgentLocalId, assignedAgentName, category, attachments }: { projectId: string; title: string; description?: string; assignedAgentLocalId?: string; assignedAgentName?: string; category?: string; attachments?: MessageAttachment[] }) => {
      const ticketNumber = localDatabase.getNextTicketNumber(projectId)
      const ticket: Ticket = {
        id: randomUUID(),
        projectId,
        ticketNumber,
        title,
        description,
        status: 'open',
        category: category as Ticket['category'],
        assignedAgentLocalId,
        assignedAgentName,
        sortOrder: Date.now(),
        comments: [],
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      localDatabase.saveTicket(ticket)
      localDatabase.addToSyncQueue('ticket', ticket.id, 'create', ticket)
      this.mainWindow?.webContents.send(IpcChannel.TICKET_UPDATE, { type: 'created', ticket })
      return ticket
    })

    ipcMain.handle(IpcChannel.UPDATE_TICKET, async (_event, { ticketId, projectId, updates }: { ticketId: string; projectId?: string; updates: Partial<Ticket> }) => {
      localDatabase.updateTicket(ticketId, { ...updates, updatedAt: new Date().toISOString() }, projectId)
      localDatabase.addToSyncQueue('ticket', ticketId, 'update', { id: ticketId, ...updates })
      const ticket = localDatabase.getTicket(ticketId)
      this.mainWindow?.webContents.send(IpcChannel.TICKET_UPDATE, { type: 'updated', ticket })
      return ticket
    })

    ipcMain.handle(IpcChannel.DELETE_TICKET, async (_event, { ticketId, projectId }: { ticketId: string; projectId?: string }) => {
      localDatabase.deleteTicket(ticketId, projectId)
      localDatabase.addToSyncQueue('ticket', ticketId, 'delete', { id: ticketId })
      this.mainWindow?.webContents.send(IpcChannel.TICKET_UPDATE, { type: 'deleted', ticketId })
      return { success: true }
    })

    ipcMain.handle(IpcChannel.ADD_TICKET_COMMENT, async (_event, { ticketId, projectId, content }: { ticketId: string; projectId: string; content: string }) => {
      const comment: TicketComment = {
        id: randomUUID(),
        ticketId,
        projectId,
        authorType: 'user',
        content,
        clientTimestamp: new Date().toISOString(),
      }
      localDatabase.saveComment(comment)
      localDatabase.addToSyncQueue('ticket_comment', comment.id, 'create', comment)
      this.mainWindow?.webContents.send(IpcChannel.TICKET_UPDATE, { type: 'comment-added', ticketId, comment })

      // Check for @mentions in comment — agent replies as ticket comment
      this.chatOrchestrator.handleTicketCommentMention(projectId, ticketId, content).catch(() => {})

      return comment
    })

    ipcMain.handle(IpcChannel.IMPORT_TICKETS, async (_event, { projectId, content }: { projectId: string; content?: string }) => {
      return this.importTickets(projectId, content)
    })
  }

  /** JSON-Ticket-Import: ohne content öffnet ein Datei-Dialog (Drag&Drop liefert content direkt). */
  private async importTickets(projectId: string, content?: string): Promise<ImportResult> {
    let jsonText = content
    if (!jsonText) {
      const win = BrowserWindow.getFocusedWindow() ?? this.mainWindow
      if (!win) return { success: false, canceled: true }
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
      const fs = require('fs') as typeof import('fs')
      jsonText = fs.readFileSync(result.filePaths[0], 'utf-8')
    }

    let raw: unknown
    try {
      raw = JSON.parse(jsonText)
    } catch {
      return { success: false, errors: ['Datei enthält kein gültiges JSON'] }
    }

    // Validierungsfehler → Import komplett abbrechen
    const validation = validateTicketImport(raw)
    if (!validation.success) {
      return { success: false, errors: validation.errors }
    }

    const plan = planTicketImport(validation.data, {
      projectId,
      existingByExternalId: localDatabase.getTicketIdsByExternalId(projectId),
      agents: localDatabase.getAgentsByProject(projectId).map((a) => ({ id: a.id, name: a.name })),
      nextTicketNumber: localDatabase.getNextTicketNumber(projectId),
      now: new Date().toISOString(),
      generateId: randomUUID,
    })

    try {
      localDatabase.applyTicketImport(plan)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('error', `Ticket import failed: ${msg}`)
      return { success: false, errors: [`Import fehlgeschlagen: ${msg}`] }
    }

    log('info', `Ticket import: ${plan.inserts.length} created, ${plan.updates.length} updated, ${plan.warnings.length} warnings`)
    this.syncService.processSyncQueue().catch(() => {})

    for (const ticket of plan.inserts) {
      this.mainWindow?.webContents.send(IpcChannel.TICKET_UPDATE, { type: 'created', ticket })
    }
    for (const { id } of plan.updates) {
      const ticket = localDatabase.getTicket(id)
      if (ticket) this.mainWindow?.webContents.send(IpcChannel.TICKET_UPDATE, { type: 'updated', ticket })
    }

    return {
      success: true,
      imported: plan.inserts.length,
      updated: plan.updates.length,
      warnings: plan.warnings,
    }
  }

  // ── Document IPC Handlers ──────────────────────────────────────────────

  private registerDocumentIpcHandlers(): void {
    ipcMain.handle(IpcChannel.GET_DOCUMENTS, async (_event, { projectId }: { projectId: string }) => {
      return localDatabase.getDocumentsByProject(projectId)
    })

    ipcMain.handle(IpcChannel.CREATE_DOCUMENT, async (_event, { projectId, title, content }: { projectId: string; title: string; content: string }) => {
      const now = new Date().toISOString()
      const doc: ProjectDocument = {
        id: randomUUID(),
        projectId,
        title,
        content,
        createdAt: now,
        updatedAt: now,
      }
      localDatabase.saveDocument(doc)
      localDatabase.addToSyncQueue('document', doc.id, 'create', doc)
      this.mainWindow?.webContents.send(IpcChannel.DOCUMENT_UPDATE, { type: 'created', document: doc })
      return doc
    })

    ipcMain.handle(IpcChannel.UPDATE_DOCUMENT, async (_event, { documentId, projectId, updates }: { documentId: string; projectId?: string; updates: { title?: string; content?: string } }) => {
      localDatabase.updateDocument(documentId, updates, projectId)
      const doc = localDatabase.getDocument(documentId)
      if (doc) {
        localDatabase.addToSyncQueue('document', documentId, 'update', { id: documentId, ...updates })
        this.mainWindow?.webContents.send(IpcChannel.DOCUMENT_UPDATE, { type: 'updated', document: doc })
      }
      return doc
    })

    ipcMain.handle(IpcChannel.DELETE_DOCUMENT, async (_event, { documentId, projectId }: { documentId: string; projectId?: string }) => {
      localDatabase.deleteDocument(documentId, projectId)
      localDatabase.addToSyncQueue('document', documentId, 'delete', { id: documentId })
      this.mainWindow?.webContents.send(IpcChannel.DOCUMENT_UPDATE, { type: 'deleted', documentId })
      return { success: true }
    })
  }

  // ── Goal IPC Handlers ───────────────────────────────────────────────────

  private registerGoalIpcHandlers(): void {
    ipcMain.handle(IpcChannel.START_GOAL, async (_event, { projectId, description, selectedAgentIds }: { projectId: string; description: string; selectedAgentIds?: string[] }) => {
      return await this.autonomousLoopService.startGoal(projectId, description, selectedAgentIds)
    })

    ipcMain.handle(IpcChannel.START_GOAL_FROM_TICKETS, async (_event, { projectId, ticketIds, selectedAgentIds }: { projectId: string; ticketIds: string[]; selectedAgentIds?: string[] }) => {
      return await this.autonomousLoopService.startSelectedTicketsGoal(projectId, ticketIds, selectedAgentIds)
    })

    ipcMain.handle(IpcChannel.GET_GOALS, async (_event, { projectId }: { projectId: string }) => {
      return localDatabase.getGoalsByProject(projectId)
    })

    ipcMain.handle(IpcChannel.GET_GOAL_LOG, async (_event, { goalId }: { goalId: number }) => {
      return localDatabase.getGoalRunLog(goalId)
    })

    ipcMain.handle(IpcChannel.CANCEL_GOAL, async (_event, { goalId }: { goalId: number }) => {
      this.autonomousLoopService.cancelGoal(goalId)
      return { success: true }
    })

    ipcMain.handle(IpcChannel.RETRY_GOAL, async (_event, { goalId }: { goalId: number }) => {
      return await this.autonomousLoopService.retryGoal(goalId)
    })
  }

  // ── Memory IPC Handlers ─────────────────────────────────────────────────

  private registerMemoryIpcHandlers(): void {
    ipcMain.handle(IpcChannel.GET_AGENT_MEMORIES, async (_event, { globalAgentId }: { globalAgentId: string }) => {
      return this.memoryService.listMemories(globalAgentId)
    })

    ipcMain.handle(IpcChannel.SAVE_AGENT_MEMORY, async (_event, { globalAgentId, projectId, key, value, importance }: { globalAgentId: string; projectId: string | null; key: string; value: string; importance: number }) => {
      this.memoryService.saveMemory(globalAgentId, projectId, key, value, importance, 'user')
      return { success: true }
    })

    ipcMain.handle(IpcChannel.DELETE_AGENT_MEMORY, async (_event, { memoryId }: { memoryId: number }) => {
      this.memoryService.deleteMemory(memoryId)
      return { success: true }
    })

    ipcMain.handle(IpcChannel.CLEAR_AGENT_MEMORIES, async (_event, { globalAgentId }: { globalAgentId: string }) => {
      this.memoryService.clearAllMemories(globalAgentId)
      return { success: true }
    })
  }

  // ── Rating IPC Handlers ─────────────────────────────────────────────

  private static readonly VALID_PERIODS: RatingPeriod[] = ['unter_1_monat', '1_3_monate', '3_6_monate', '6_12_monate', 'ueber_12_monate']
  private static readonly VALID_STAY_TYPES: RatingStayType[] = ['stationiert', 'kommandiert', 'durchreise']
  private static readonly VALID_CATEGORIES = ['sauberkeit', 'ausstattung', 'lage', 'service', 'verpflegung', 'atmosphaere', 'sicherheit', 'preis_leistung']
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  private static readonly MIN_IMPRESSION_CHARS = 100
  private static readonly MIN_TITLE_CHARS = 100

  private verificationAttempts: Map<string, { count: number; lastAttempt: number }> = new Map()
  private static readonly MAX_VERIFICATION_ATTEMPTS = 5
  private static readonly VERIFICATION_LOCKOUT_MS = 15 * 60 * 1000

  private static readonly VERIFICATION_CODE_EXPIRY_MINUTES = 10

  private generateVerificationCode(): string {
    return String(randomInt(100000, 1000000))
  }

  private getCodeExpiresAt(): string {
    const expires = new Date()
    expires.setMinutes(expires.getMinutes() + Orchestrator.VERIFICATION_CODE_EXPIRY_MINUTES)
    return expires.toISOString()
  }

  private validateRatingSubmission(data: {
    projectId: string
    period: string
    stayType: string
    impression: string
    categories: string[]
    facilitiesInside?: string[]
    facilitiesNearby?: string[]
    title: string
    firstName: string
    email: string
    consent: boolean
    demographics?: { sleepType?: string | null; rank?: string | null; ageGroup?: string | null; familyStatus?: string | null }
  }): string[] {
    const errors: string[] = []

    if (!data.projectId?.trim()) errors.push('Project-ID ist erforderlich')
    if (!data.period || !Orchestrator.VALID_PERIODS.includes(data.period as RatingPeriod)) errors.push('Ungültiger Zeitraum')
    if (!data.stayType || !Orchestrator.VALID_STAY_TYPES.includes(data.stayType as RatingStayType)) errors.push('Ungültige Aufenthaltsart')
    if (!data.impression || data.impression.length < Orchestrator.MIN_IMPRESSION_CHARS) errors.push(`Gesamteindruck muss mindestens ${Orchestrator.MIN_IMPRESSION_CHARS} Zeichen haben`)
    if (!data.categories || data.categories.length < 1) errors.push('Mindestens eine Kategorie erforderlich')
    if (data.categories?.some((c: string) => !Orchestrator.VALID_CATEGORIES.includes(c))) errors.push('Ungültige Kategorie enthalten')
    if (!data.title || data.title.length < Orchestrator.MIN_TITLE_CHARS) errors.push(`Titel muss mindestens ${Orchestrator.MIN_TITLE_CHARS} Zeichen haben`)
    if (!data.firstName?.trim()) errors.push('Vorname ist erforderlich')
    if (!data.email?.trim()) {
      errors.push('E-Mail ist erforderlich')
    } else if (!Orchestrator.EMAIL_REGEX.test(data.email)) {
      errors.push('Ungültige E-Mail-Adresse')
    }
    if (!data.consent) errors.push('Zustimmung zu den Nutzungsbedingungen erforderlich')

    return errors
  }

  private registerRatingIpcHandlers(): void {
    ipcMain.handle(IpcChannel.SUBMIT_RATING, async (_event, data: {
      projectId: string
      period: string
      stayType: string
      impression: string
      categories: string[]
      facilitiesInside?: string[]
      facilitiesNearby?: string[]
      title: string
      firstName: string
      email: string
      consent: boolean
      demographics?: { sleepType?: string | null; rank?: string | null; ageGroup?: string | null; familyStatus?: string | null }
    }) => {
      const errors = this.validateRatingSubmission(data)
      if (errors.length > 0) {
        return { success: false, errors }
      }

      const now = new Date().toISOString()
      const verificationCode = this.generateVerificationCode()

      const rating: Rating = {
        id: randomUUID(),
        projectId: data.projectId,
        period: data.period as RatingPeriod,
        stayType: data.stayType as RatingStayType,
        categories: data.categories,
        facilitiesInside: data.facilitiesInside || [],
        facilitiesNearby: data.facilitiesNearby || [],
        impression: data.impression,
        title: data.title,
        sleepType: data.demographics?.sleepType || null,
        rank: data.demographics?.rank || null,
        ageGroup: data.demographics?.ageGroup || null,
        familyStatus: data.demographics?.familyStatus || null,
        firstName: data.firstName,
        email: data.email,
        status: 'pending_verification',
        verificationCode,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      }

      localDatabase.saveRating(rating)
      localDatabase.addToSyncQueue('rating', rating.id, 'create', { ...rating, verificationCode: undefined })

      log('info', `Rating ${rating.id} submitted for verification (email: ${rating.email})`)
      this.mainWindow?.webContents.send(IpcChannel.RATING_UPDATE, { type: 'submitted', rating: { ...rating, verificationCode: undefined } })

      return { success: true, ratingId: rating.id }
    })

    ipcMain.handle(IpcChannel.VERIFY_RATING, async (_event, { ratingId, code }: { ratingId: string; code: string }) => {
      const attempts = this.verificationAttempts.get(ratingId)
      if (attempts && attempts.count >= Orchestrator.MAX_VERIFICATION_ATTEMPTS) {
        const elapsed = Date.now() - attempts.lastAttempt
        if (elapsed < Orchestrator.VERIFICATION_LOCKOUT_MS) {
          const remainingMin = Math.ceil((Orchestrator.VERIFICATION_LOCKOUT_MS - elapsed) / 60000)
          return { success: false, error: `Zu viele Versuche. Bitte warte ${remainingMin} Minuten.` }
        }
        this.verificationAttempts.delete(ratingId)
      }

      const rating = localDatabase.getRating(ratingId)
      if (!rating) {
        return { success: false, error: 'Bewertung nicht gefunden' }
      }
      if (rating.status !== 'pending_verification') {
        return { success: false, error: 'Bewertung ist nicht im Verifizierungsstatus' }
      }
      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return { success: false, error: 'Ungültiger Verifizierungscode (6 Ziffern erwartet)' }
      }
      if (rating.verificationCode !== code) {
        const current = this.verificationAttempts.get(ratingId) ?? { count: 0, lastAttempt: 0 }
        this.verificationAttempts.set(ratingId, { count: current.count + 1, lastAttempt: Date.now() })
        return { success: false, error: 'Falscher Verifizierungscode' }
      }

      this.verificationAttempts.delete(ratingId)
      const now = new Date().toISOString()
      localDatabase.updateRatingStatus(ratingId, 'published', now)
      localDatabase.addToSyncQueue('rating', ratingId, 'update', { id: ratingId, status: 'published', verifiedAt: now })

      log('info', `Rating ${ratingId} verified and published`)
      const updated = localDatabase.getRating(ratingId)
      this.mainWindow?.webContents.send(IpcChannel.RATING_UPDATE, { type: 'verified', rating: updated })

      return { success: true }
    })

    ipcMain.handle(IpcChannel.RESEND_VERIFICATION, async (_event, { ratingId }: { ratingId: string }) => {
      const rating = localDatabase.getRating(ratingId)
      if (!rating) {
        return { success: false, error: 'Bewertung nicht gefunden' }
      }
      if (rating.status !== 'pending_verification') {
        return { success: false, error: 'Bewertung ist nicht im Verifizierungsstatus' }
      }

      const newCode = this.generateVerificationCode()
      const now = new Date().toISOString()
      const updatedRating: Rating = { ...rating, verificationCode: newCode, updatedAt: now }
      localDatabase.saveRating(updatedRating)

      log('info', `Verification code resent for rating ${ratingId} (email: ${rating.email})`)

      return { success: true }
    })

    ipcMain.handle(IpcChannel.GET_RATINGS, async (_event, { projectId, status }: { projectId: string; status?: string }) => {
      if (status) {
        return localDatabase.getRatingsByStatus(projectId, status)
      }
      return localDatabase.getRatingsByProject(projectId)
    })

    ipcMain.handle(IpcChannel.GET_RATING, async (_event, { ratingId }: { ratingId: string }) => {
      return localDatabase.getRating(ratingId)
    })

    ipcMain.handle(IpcChannel.DELETE_RATING, async (_event, { ratingId, projectId }: { ratingId: string; projectId?: string }) => {
      localDatabase.deleteRating(ratingId, projectId)
      localDatabase.addToSyncQueue('rating', ratingId, 'delete', { id: ratingId })
      this.mainWindow?.webContents.send(IpcChannel.RATING_UPDATE, { type: 'deleted', ratingId })
      return { success: true }
    })
  }

  // ── Email Verification IPC Handlers ─────────────────────────────────────

  private registerEmailVerificationIpcHandlers(): void {
    ipcMain.handle(IpcChannel.SEND_EMAIL_VERIFICATION, async (_event, { email }: { email: string }) => {
      if (!email?.trim()) {
        return { success: false, error: 'E-Mail ist erforderlich' }
      }
      if (!Orchestrator.EMAIL_REGEX.test(email)) {
        return { success: false, error: 'Ungültige E-Mail-Adresse' }
      }

      const code = this.generateVerificationCode()
      const now = new Date().toISOString()
      const verificationId = randomUUID()

      localDatabase.cleanupExpiredEmailVerifications()
      localDatabase.saveEmailVerification({
        id: verificationId,
        email: email.trim().toLowerCase(),
        code,
        maxAttempts: Orchestrator.MAX_VERIFICATION_ATTEMPTS,
        expiresAt: this.getCodeExpiresAt(),
        createdAt: now,
      })

      localDatabase.addToSyncQueue('email_verification', verificationId, 'create', {
        id: verificationId,
        email: email.trim().toLowerCase(),
        type: 'rating_verification',
      })

      log('info', `Email verification code sent for ${email} (id: ${verificationId})`)

      return { success: true, verificationId }
    })

    ipcMain.handle(IpcChannel.VERIFY_EMAIL_CODE, async (_event, { verificationId, code }: { verificationId: string; code: string }) => {
      const verification = localDatabase.getEmailVerification(verificationId)
      if (!verification) {
        return { success: false, error: 'Verifizierung nicht gefunden' }
      }

      if (verification.verifiedAt) {
        return { success: true, email: verification.email }
      }

      const now = new Date()
      if (now > new Date(verification.expiresAt)) {
        return { success: false, error: 'Der Verifizierungscode ist abgelaufen. Bitte fordern Sie einen neuen an.' }
      }

      if (verification.attempts >= verification.maxAttempts) {
        return { success: false, error: `Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.` }
      }

      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return { success: false, error: 'Ungültiger Verifizierungscode (6 Ziffern erwartet)' }
      }

      if (verification.code !== code) {
        localDatabase.incrementEmailVerificationAttempts(verificationId)
        const remaining = verification.maxAttempts - verification.attempts - 1
        return {
          success: false,
          error: remaining > 0
            ? `Falscher Code. ${remaining} Versuch(e) verbleibend.`
            : 'Falscher Code. Bitte fordern Sie einen neuen Code an.',
        }
      }

      localDatabase.markEmailVerified(verificationId)
      log('info', `Email ${verification.email} verified (id: ${verificationId})`)

      return { success: true, email: verification.email }
    })

    ipcMain.handle(IpcChannel.RESEND_EMAIL_VERIFICATION, async (_event, { verificationId }: { verificationId: string }) => {
      const verification = localDatabase.getEmailVerification(verificationId)
      if (!verification) {
        return { success: false, error: 'Verifizierung nicht gefunden' }
      }

      if (verification.verifiedAt) {
        return { success: false, error: 'E-Mail ist bereits verifiziert' }
      }

      const newCode = this.generateVerificationCode()
      localDatabase.updateEmailVerificationCode(verificationId, newCode, this.getCodeExpiresAt())

      localDatabase.addToSyncQueue('email_verification', verificationId, 'create', {
        id: verificationId,
        email: verification.email,
        type: 'rating_verification',
      })

      log('info', `Email verification code resent for ${verification.email} (id: ${verificationId})`)

      return { success: true }
    })
  }

  // ── Sync Events ────────────────────────────────────────────────────────

  private wireSyncEvents(): void {
    this.syncService.on('sync-completed', (data: { synced: number; failed: number; timestamp: string }) => {
      this.mainWindow?.webContents.send(IpcChannel.SYNC_STATUS_UPDATE, { type: 'completed', ...data })
    })

    this.syncService.on('connectivity-changed', (isOnline: boolean) => {
      this.mainWindow?.webContents.send(IpcChannel.SYNC_STATUS_UPDATE, { type: 'connectivity', isOnline })
    })

    this.syncService.on('full-sync-completed', () => {
      this.mainWindow?.webContents.send(IpcChannel.SYNC_STATUS_UPDATE, { type: 'full-sync-completed' })
    })
  }

  // ── Broadcast ───────────────────────────────────────────────────────────

  private broadcastStateUpdate(): void {
    const currentState = this.getState()
    this.state = currentState
    this.mainWindow?.webContents.send(IpcChannel.STATE_UPDATE, currentState)
    this.emit('state-update', currentState)
  }
}

// ── Singleton export ────────────────────────────────────────────────────────

export const orchestrator = new Orchestrator()

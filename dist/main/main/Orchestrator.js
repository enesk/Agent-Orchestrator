"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrator = exports.Orchestrator = void 0;
const electron_1 = require("electron");
const crypto_1 = require("crypto");
const events_1 = require("events");
const child_process_1 = require("child_process");
const ClaudeProcessManager_1 = require("./ClaudeProcessManager");
const BackendConnection_1 = require("./BackendConnection");
const LocalDatabase_1 = require("./LocalDatabase");
const SyncService_1 = require("./SyncService");
const ChatOrchestrator_1 = require("./ChatOrchestrator");
const AttachmentStorage_1 = require("./AttachmentStorage");
const MemoryService_1 = require("./services/MemoryService");
const AutonomousLoopService_1 = require("./services/AutonomousLoopService");
const ipc_channels_1 = require("../shared/ipc-channels");
const ticketImport_1 = require("../shared/ticketImport");
const constants_1 = require("../shared/constants");
const Logger_1 = require("./Logger");
const StoreManager_1 = require("./StoreManager");
// ── Class ───────────────────────────────────────────────────────────────────
class Orchestrator extends events_1.EventEmitter {
    constructor(claude = ClaudeProcessManager_1.claudeProcessManager, backend = BackendConnection_1.backendConnection) {
        super();
        this.claude = claude;
        this.backend = backend;
        this.activeSessions = new Map();
        this.mainWindow = null;
        this.lastConnectedAt = null;
        this.verificationAttempts = new Map();
        this.syncService = new SyncService_1.SyncService(LocalDatabase_1.localDatabase);
        this.chatOrchestrator = new ChatOrchestrator_1.ChatOrchestrator(LocalDatabase_1.localDatabase, this.syncService);
        this.memoryService = new MemoryService_1.MemoryService(LocalDatabase_1.localDatabase);
        this.autonomousLoopService = new AutonomousLoopService_1.AutonomousLoopService(LocalDatabase_1.localDatabase, this.chatOrchestrator);
        this.state = this.buildState();
    }
    // ── Public API ──────────────────────────────────────────────────────────
    async initialize() {
        (0, Logger_1.log)('info', 'Orchestrator initializing...');
        // Initialize local database
        LocalDatabase_1.localDatabase.initialize();
        AttachmentStorage_1.attachmentStorage.initialize();
        this.chatOrchestrator.initialize();
        // Wire up the BackendConnection state callback so it can send current state on connect
        this.backend.getOrchestratorState = () => this.getState();
        // Register all event handlers
        this.wireClaudeEvents();
        this.wireBackendEvents();
        this.registerIpcHandlers();
        this.registerChatIpcHandlers();
        this.registerTicketIpcHandlers();
        this.registerDocumentIpcHandlers();
        this.registerMemoryIpcHandlers();
        this.registerGoalIpcHandlers();
        this.registerRatingIpcHandlers();
        this.registerEmailVerificationIpcHandlers();
        this.wireSyncEvents();
        // Forward log entries to renderer
        (0, Logger_1.setLogCallback)((entry) => {
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.LOG_UPDATE, entry);
        });
        // Auto-connect if credentials are stored
        const settings = (0, StoreManager_1.getSettings)();
        if (settings.userToken && settings.backendUrl) {
            (0, Logger_1.log)('info', 'Found stored credentials, auto-connecting...');
            await this.connect(settings.backendUrl, settings.userToken);
        }
        (0, Logger_1.log)('info', 'Orchestrator initialized');
    }
    setMainWindow(win) {
        this.mainWindow = win;
        this.chatOrchestrator.setMainWindow(win);
        this.autonomousLoopService.setMainWindow(win);
        // Resume any goals that were interrupted by app restart
        this.autonomousLoopService.resumeInterruptedGoals().catch((err) => {
            (0, Logger_1.log)('error', `[Goal] Failed to resume interrupted goals: ${err}`);
        });
    }
    async connect(backendUrl, token) {
        // Validate backend URL
        if (!/^(wss?|https?):\/\/.+/.test(backendUrl)) {
            const msg = 'Invalid backend URL. Must start with https:// or wss://';
            (0, Logger_1.log)('error', msg);
            throw new Error(msg);
        }
        // Validate token
        if (!token || token.trim().length === 0) {
            const msg = 'Token must not be empty';
            (0, Logger_1.log)('error', msg);
            throw new Error(msg);
        }
        // Persist credentials
        (0, StoreManager_1.saveSettings)({ backendUrl, userToken: token });
        // Start Claude process if not already running
        if (!this.claude.isRunning()) {
            (0, Logger_1.log)('info', 'Starting Claude Code CLI...');
            await this.claude.start();
        }
        // Connect to backend (validates token first, then opens WebSocket)
        (0, Logger_1.log)('info', `Connecting to backend: ${backendUrl}`);
        await this.backend.connect(backendUrl, token);
        // Initialize sync service with backend credentials
        this.syncService.initialize(backendUrl, token);
        this.broadcastStateUpdate();
    }
    disconnect() {
        (0, Logger_1.log)('info', 'Disconnecting...');
        // Stop all active sessions first
        this.stopAllSessions('Orchestrator disconnecting');
        // Disconnect backend
        this.backend.disconnect();
        // Stop Claude process
        this.claude.stop();
        // Clear stored credentials so UI returns to login
        (0, StoreManager_1.saveSettings)({ backendUrl: '', userToken: '' });
        this.broadcastStateUpdate();
    }
    getState() {
        return this.buildState();
    }
    destroy() {
        (0, Logger_1.log)('info', 'Orchestrator shutting down...');
        this.stopAllSessions('Orchestrator shutting down');
        this.syncService.stop();
        LocalDatabase_1.localDatabase.close();
        this.claude.stop();
        this.backend.destroy();
    }
    // ── Event Wiring: Claude Process ────────────────────────────────────────
    wireClaudeEvents() {
        this.claude.on('ready', () => {
            (0, Logger_1.log)('info', 'Claude Code CLI is ready');
            this.state.claudeRunning = true;
            this.broadcastStateUpdate();
        });
        this.claude.on('output', (output) => {
            this.handleClaudeOutput(output);
        });
        this.claude.on('raw-output', (text) => {
            (0, Logger_1.log)('debug', `Claude raw output: ${text.substring(0, 200)}`);
        });
        this.claude.on('error', (message) => {
            (0, Logger_1.log)('error', `Claude error: ${message}`);
        });
        this.claude.on('crashed', (exitCode) => {
            (0, Logger_1.log)('error', `Claude process crashed with exit code ${exitCode}`);
            this.state.claudeRunning = false;
            // Notify backend about all running sessions failing
            this.activeSessions.forEach((session) => {
                if (session.status === 'running') {
                    session.status = 'error';
                    this.backend.send({
                        type: 'error',
                        agentId: session.agentId,
                        sessionId: session.sessionId,
                        error: `Claude Code crashed (exit code ${exitCode})`,
                        timestamp: Date.now(),
                    });
                }
            });
            this.activeSessions.clear();
            this.broadcastStateUpdate();
        });
        this.claude.on('stopped', () => {
            (0, Logger_1.log)('info', 'Claude Code CLI stopped');
            this.state.claudeRunning = false;
            this.broadcastStateUpdate();
        });
        this.claude.on('fatal-error', (message) => {
            (0, Logger_1.log)('error', `Claude fatal error: ${message}`);
            this.state.claudeRunning = false;
            // Fail all active sessions
            this.activeSessions.forEach((session) => {
                if (session.status === 'running') {
                    session.status = 'error';
                    this.backend.send({
                        type: 'error',
                        agentId: session.agentId,
                        sessionId: session.sessionId,
                        error: message,
                        timestamp: Date.now(),
                    });
                }
            });
            this.activeSessions.clear();
            this.broadcastStateUpdate();
        });
    }
    // ── Event Wiring: Backend Connection ────────────────────────────────────
    wireBackendEvents() {
        this.backend.on('connected', () => {
            (0, Logger_1.log)('info', 'Backend connected');
            this.state.connected = true;
            this.lastConnectedAt = new Date().toISOString();
            this.broadcastStateUpdate();
        });
        this.backend.on('disconnected', () => {
            (0, Logger_1.log)('info', 'Backend disconnected');
            this.state.connected = false;
            this.broadcastStateUpdate();
        });
        this.backend.on('message', (msg) => {
            this.handleIncomingMessage(msg);
        });
        this.backend.on('status-change', (status) => {
            (0, Logger_1.log)('debug', `Backend status changed: ${status}`);
            this.broadcastStateUpdate();
        });
        this.backend.on('error', (message) => {
            (0, Logger_1.log)('error', `Backend error: ${message}`);
        });
        this.backend.on('max-reconnect-reached', () => {
            (0, Logger_1.log)('error', 'Backend max reconnect attempts reached. Manual reconnect required.');
            this.broadcastStateUpdate();
        });
    }
    // ── Incoming Message Handler ────────────────────────────────────────────
    handleIncomingMessage(msg) {
        (0, Logger_1.log)('info', `Incoming message: ${msg.type} (session: ${msg.sessionId}, agent: ${msg.agentId})`);
        switch (msg.type) {
            case 'run_agent':
                this.handleRunAgent(msg);
                break;
            case 'stop_agent':
                this.handleStopAgent(msg);
                break;
            case 'config_update':
                this.handleConfigUpdate(msg);
                break;
            // ping is handled directly in BackendConnection
        }
        this.broadcastStateUpdate();
    }
    handleRunAgent(msg) {
        const { agentId, sessionId, prompt, config } = msg;
        // Check if session is already active
        if (this.activeSessions.has(sessionId)) {
            (0, Logger_1.log)('warn', `Session ${sessionId} is already active, rejecting duplicate run_agent`);
            this.backend.send({
                type: 'error',
                agentId,
                sessionId,
                error: `Session ${sessionId} is already running`,
                timestamp: Date.now(),
            });
            return;
        }
        // Verify Claude is running
        if (!this.claude.isRunning()) {
            (0, Logger_1.log)('error', `Cannot run agent: Claude is not running`);
            this.backend.send({
                type: 'error',
                agentId,
                sessionId,
                error: 'Claude Code CLI is not running',
                timestamp: Date.now(),
            });
            return;
        }
        // Verify prompt exists
        if (!prompt) {
            (0, Logger_1.log)('warn', `run_agent without prompt for session ${sessionId}`);
            this.backend.send({
                type: 'error',
                agentId,
                sessionId,
                error: 'No prompt provided',
                timestamp: Date.now(),
            });
            return;
        }
        // Create the session
        const abortController = new AbortController();
        const session = {
            agentId,
            sessionId,
            abortController,
            startedAt: new Date(),
            outputBuffer: '',
            status: 'running',
        };
        this.activeSessions.set(sessionId, session);
        // Build the full input for Claude
        let input = '';
        if (config?.systemPrompt) {
            input += `[System Context]\n${config.systemPrompt}\n\n[User Request]\n`;
        }
        input += prompt;
        (0, Logger_1.log)('info', `Starting agent ${agentId} for session ${sessionId}`, sessionId);
        // Set up timeout if configured
        if (config?.timeout && config.timeout > 0) {
            const timeoutId = setTimeout(() => {
                const activeSession = this.activeSessions.get(sessionId);
                if (activeSession && activeSession.status === 'running') {
                    (0, Logger_1.log)('warn', `Session ${sessionId} timed out after ${config.timeout}ms`, sessionId);
                    this.abortSession(sessionId, `Timeout after ${config.timeout}ms`);
                }
            }, config.timeout);
            // Clear timeout if session is aborted
            abortController.signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
            });
        }
        // Send command to Claude
        this.claude.sendCommand(input);
    }
    handleStopAgent(msg) {
        const { sessionId, agentId } = msg;
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            (0, Logger_1.log)('warn', `stop_agent: session ${sessionId} not found`);
            this.backend.send({
                type: 'error',
                agentId,
                sessionId,
                error: `Session ${sessionId} not found`,
                timestamp: Date.now(),
            });
            return;
        }
        this.abortSession(sessionId, 'Stopped by backend request');
    }
    handleConfigUpdate(msg) {
        (0, Logger_1.log)('info', `Config update received for session ${msg.sessionId}`, msg.sessionId);
        if (msg.config) {
            const session = this.activeSessions.get(msg.sessionId);
            if (session) {
                (0, Logger_1.log)('debug', `Config update applied to session ${msg.sessionId}`);
            }
        }
    }
    // ── Claude Output Handler ───────────────────────────────────────────────
    handleClaudeOutput(output) {
        const sessionId = output.session_id;
        const session = sessionId ? this.activeSessions.get(sessionId) : null;
        // Route based on Claude stream-json output type
        switch (output.type) {
            case 'assistant': {
                // Assistant message chunk with content
                const content = output.content ?? output.message ?? '';
                if (content && session) {
                    session.outputBuffer += content;
                    this.backend.send({
                        type: 'output',
                        agentId: session.agentId,
                        sessionId: session.sessionId,
                        data: content,
                        timestamp: Date.now(),
                    });
                }
                break;
            }
            case 'result': {
                // Agent completed successfully
                if (session) {
                    const resultData = output.result ?? output.content ?? session.outputBuffer;
                    session.status = 'completed';
                    (0, Logger_1.log)('info', `Session ${session.sessionId} completed`, session.sessionId);
                    this.backend.send({
                        type: 'completed',
                        agentId: session.agentId,
                        sessionId: session.sessionId,
                        data: typeof resultData === 'string' ? resultData : JSON.stringify(resultData),
                        timestamp: Date.now(),
                    });
                    this.activeSessions.delete(session.sessionId);
                    this.broadcastStateUpdate();
                }
                break;
            }
            case 'error': {
                // Claude reported an error
                const errorMsg = output.error ?? output.content ?? 'Unknown Claude error';
                if (session) {
                    session.status = 'error';
                    (0, Logger_1.log)('error', `Session ${session.sessionId} error: ${errorMsg}`, session.sessionId);
                    this.backend.send({
                        type: 'error',
                        agentId: session.agentId,
                        sessionId: session.sessionId,
                        error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
                        timestamp: Date.now(),
                    });
                    this.activeSessions.delete(session.sessionId);
                    this.broadcastStateUpdate();
                }
                else {
                    (0, Logger_1.log)('error', `Claude error (no session): ${errorMsg}`);
                }
                break;
            }
            case 'system': {
                // System messages from Claude (info, progress, etc.)
                (0, Logger_1.log)('debug', `Claude system: ${JSON.stringify(output).substring(0, 200)}`);
                break;
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
                    });
                }
                break;
            }
        }
    }
    // ── Session Management ──────────────────────────────────────────────────
    abortSession(sessionId, reason) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        (0, Logger_1.log)('info', `Aborting session ${sessionId}: ${reason}`, sessionId);
        session.abortController.abort();
        session.status = 'stopped';
        this.backend.send({
            type: 'completed',
            agentId: session.agentId,
            sessionId: session.sessionId,
            data: reason,
            timestamp: Date.now(),
        });
        this.activeSessions.delete(sessionId);
        this.broadcastStateUpdate();
    }
    stopAllSessions(reason) {
        if (this.activeSessions.size === 0)
            return;
        (0, Logger_1.log)('info', `Stopping all ${this.activeSessions.size} active session(s): ${reason}`);
        this.activeSessions.forEach((session) => {
            if (session.status === 'running') {
                session.abortController.abort();
                session.status = 'stopped';
                this.backend.send({
                    type: 'error',
                    agentId: session.agentId,
                    sessionId: session.sessionId,
                    error: reason,
                    timestamp: Date.now(),
                });
            }
        });
        this.activeSessions.clear();
    }
    // ── State ───────────────────────────────────────────────────────────────
    buildState() {
        return {
            connected: this.backend.connected,
            claudeRunning: this.claude.isRunning(),
            activeSessions: this.activeSessions.size,
            userToken: (0, StoreManager_1.getToken)() ? '***' : null,
            backendUrl: (0, StoreManager_1.getBackendUrl)() || null,
            userEmail: null,
            planName: null,
            lastConnectedAt: this.lastConnectedAt,
            version: constants_1.APP_VERSION,
        };
    }
    // ── IPC Handlers ────────────────────────────────────────────────────────
    registerIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_STATE, async () => {
            return this.getState();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CONNECT, async (_event, { backendUrl, token }) => {
            await this.connect(backendUrl, token);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DISCONNECT, async () => {
            this.disconnect();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_LOGS, async () => {
            return (0, Logger_1.getLogEntries)();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_SETTINGS, async () => {
            return (0, StoreManager_1.getSettings)();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SAVE_SETTINGS, async (_event, settings) => {
            (0, StoreManager_1.saveSettings)(settings);
            // If claudePath changed, update the process manager
            if (settings.claudePath) {
                (0, Logger_1.log)('info', `Claude path updated to: ${settings.claudePath}`);
            }
            return (0, StoreManager_1.getSettings)();
        });
        electron_1.ipcMain.on(ipc_channels_1.IpcChannel.MINIMIZE_TO_TRAY, () => {
            this.mainWindow?.hide();
        });
    }
    // ── Chat IPC Handlers ──────────────────────────────────────────────────
    registerChatIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_PROJECTS, async () => {
            return this.chatOrchestrator.loadProjects();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CREATE_PROJECT, async (_event, data) => {
            const project = {
                id: (0, crypto_1.randomUUID)(),
                name: data.name,
                description: data.description,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                agents: [],
            };
            LocalDatabase_1.localDatabase.saveProject(project);
            LocalDatabase_1.localDatabase.addToSyncQueue('project', project.id, 'create', project);
            this.chatOrchestrator.loadProjects();
            return project;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.UPDATE_PROJECT, async (_event, data) => {
            const existing = LocalDatabase_1.localDatabase.getProject(data.id);
            if (!existing)
                throw new Error('Project not found');
            const updated = {
                ...existing,
                name: data.name ?? existing.name,
                description: data.description ?? existing.description,
                metadata: (data.metadata && Object.keys(data.metadata).length > 0) ? data.metadata : existing.metadata,
                updatedAt: new Date().toISOString(),
                agents: LocalDatabase_1.localDatabase.getAgentsByProject(data.id),
            };
            LocalDatabase_1.localDatabase.saveProject(updated);
            LocalDatabase_1.localDatabase.addToSyncQueue('project', updated.id, 'update', updated);
            this.chatOrchestrator.loadProjects();
            return updated;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_PROJECT, async (_event, projectId) => {
            LocalDatabase_1.localDatabase.deleteProject(projectId);
            LocalDatabase_1.localDatabase.addToSyncQueue('project', projectId, 'delete', { id: projectId });
            this.chatOrchestrator.loadProjects();
            return { success: true };
        });
        // ── Global Agents ──────────────────────────────────────────────────────
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_GLOBAL_AGENTS, async () => {
            return LocalDatabase_1.localDatabase.getAllGlobalAgents();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CREATE_GLOBAL_AGENT, async (_event, agent) => {
            const now = new Date().toISOString();
            const newAgent = {
                id: (0, crypto_1.randomUUID)(),
                name: agent.name ?? 'Agent',
                title: agent.title,
                mentionKey: agent.mentionKey ?? '@' + (agent.name ?? 'agent').toLowerCase().replace(/\s+/g, ''),
                systemPrompt: agent.systemPrompt ?? '',
                color: agent.color ?? '#6366f1',
                avatar: agent.avatar,
                model: agent.model ?? constants_1.DEFAULT_AGENT_MODEL,
                effort: agent.effort ?? constants_1.DEFAULT_AGENT_EFFORT,
                createdAt: now,
                updatedAt: now,
            };
            LocalDatabase_1.localDatabase.saveGlobalAgent(newAgent);
            return newAgent;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.UPDATE_GLOBAL_AGENT, async (_event, { id, updates }) => {
            let existing = LocalDatabase_1.localDatabase.getGlobalAgent(id);
            // If no global agent found, this might be a project_agent id from before migration
            // Create the global agent from the project agent data
            if (!existing) {
                const now = new Date().toISOString();
                existing = {
                    id,
                    name: updates.name ?? 'Agent',
                    title: updates.title,
                    mentionKey: updates.mentionKey ?? '@agent',
                    systemPrompt: updates.systemPrompt ?? '',
                    color: updates.color ?? '#6366f1',
                    avatar: updates.avatar,
                    model: updates.model ?? constants_1.DEFAULT_AGENT_MODEL,
                    effort: updates.effort ?? constants_1.DEFAULT_AGENT_EFFORT,
                    createdAt: now,
                    updatedAt: now,
                };
                LocalDatabase_1.localDatabase.saveGlobalAgent(existing);
                // Link the project agent to this new global agent
                LocalDatabase_1.localDatabase.linkProjectAgentToGlobal(id, id);
            }
            const updated = {
                ...existing,
                ...updates,
                id,
                updatedAt: new Date().toISOString(),
            };
            if (updates.name && !updates.mentionKey) {
                updated.mentionKey = '@' + updates.name.toLowerCase().replace(/\s+/g, '');
            }
            LocalDatabase_1.localDatabase.saveGlobalAgent(updated);
            // Update all linked project agents
            LocalDatabase_1.localDatabase.updateProjectAgentsByGlobal(id, {
                name: updated.name,
                title: updated.title,
                mentionKey: updated.mentionKey,
                systemPrompt: updated.systemPrompt,
                color: updated.color,
                avatar: updated.avatar,
                model: updated.model,
                effort: updated.effort,
            });
            this.chatOrchestrator.loadProjects();
            return updated;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_GLOBAL_AGENT, async (_event, id) => {
            LocalDatabase_1.localDatabase.deleteGlobalAgent(id);
            this.chatOrchestrator.loadProjects();
            return { success: true };
        });
        // ── Project Agent assignment ────────────────────────────────────────────
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.ADD_AGENT, async (_event, { projectId, agent, globalAgentId }) => {
            let newAgent;
            if (globalAgentId) {
                // Add existing global agent to project
                const global = LocalDatabase_1.localDatabase.getGlobalAgent(globalAgentId);
                if (!global)
                    throw new Error('Global agent not found');
                newAgent = {
                    id: (0, crypto_1.randomUUID)(),
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
                };
            }
            else if (agent) {
                // Create new global agent + add to project
                const now = new Date().toISOString();
                const globalAgent = {
                    id: (0, crypto_1.randomUUID)(),
                    name: agent.name ?? 'Agent',
                    title: agent.title,
                    mentionKey: agent.mentionKey ?? '@' + (agent.name ?? 'agent').toLowerCase().replace(/\s+/g, ''),
                    systemPrompt: agent.systemPrompt ?? '',
                    color: agent.color ?? '#6366f1',
                    avatar: agent.avatar,
                    model: agent.model ?? constants_1.DEFAULT_AGENT_MODEL,
                    effort: agent.effort ?? constants_1.DEFAULT_AGENT_EFFORT,
                    createdAt: now,
                    updatedAt: now,
                };
                LocalDatabase_1.localDatabase.saveGlobalAgent(globalAgent);
                newAgent = {
                    id: (0, crypto_1.randomUUID)(),
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
                };
            }
            else {
                throw new Error('Either agent data or globalAgentId must be provided');
            }
            LocalDatabase_1.localDatabase.saveAgent(projectId, newAgent);
            LocalDatabase_1.localDatabase.addToSyncQueue('agent', newAgent.id, 'create', newAgent);
            this.chatOrchestrator.loadProjects();
            return newAgent;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.REMOVE_AGENT, async (_event, { projectId, agentId }) => {
            LocalDatabase_1.localDatabase.deleteAgent(agentId, projectId);
            LocalDatabase_1.localDatabase.addToSyncQueue('agent', agentId, 'delete', { id: agentId, projectId });
            this.chatOrchestrator.loadProjects();
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GENERATE_AGENT_PROMPT, async (_event, { skillDescription }) => {
            const claudePath = await this.claude.detectClaudePath();
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
            ].join('\n');
            (0, Logger_1.log)('info', `[PromptGen] Starting for: "${skillDescription.substring(0, 80)}"`);
            (0, Logger_1.log)('info', `[PromptGen] Claude path: ${claudePath}`);
            return new Promise((resolve, reject) => {
                const env = { ...process.env };
                delete env.CLAUDECODE;
                const proc = (0, child_process_1.spawn)(claudePath, ['-p', '--model', constants_1.DEFAULT_AGENT_MODEL], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env,
                });
                let stdout = '';
                let stderr = '';
                proc.stdout.on('data', (chunk) => {
                    stdout += chunk.toString();
                });
                proc.stderr.on('data', (chunk) => {
                    stderr += chunk.toString();
                    (0, Logger_1.log)('warn', `[PromptGen] stderr: ${chunk.toString().substring(0, 200)}`);
                });
                const timeout = setTimeout(() => {
                    (0, Logger_1.log)('error', '[PromptGen] Timed out after 60s');
                    proc.kill('SIGKILL');
                    reject(new Error('Prompt-Generierung Timeout nach 60 Sekunden'));
                }, 60000);
                proc.on('error', (err) => {
                    clearTimeout(timeout);
                    (0, Logger_1.log)('error', `[PromptGen] Spawn error: ${err.message}`);
                    reject(new Error(`Claude konnte nicht gestartet werden: ${err.message}`));
                });
                proc.on('close', (code) => {
                    clearTimeout(timeout);
                    (0, Logger_1.log)('info', `[PromptGen] Process exited with code ${code}, stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
                    if (code !== 0) {
                        reject(new Error(stderr || `Claude beendet mit Code ${code}`));
                        return;
                    }
                    if (!stdout.trim()) {
                        reject(new Error('Claude hat eine leere Antwort zurückgegeben'));
                        return;
                    }
                    resolve(stdout.trim());
                });
                // Write prompt to stdin and close immediately to signal EOF
                proc.stdin.end(metaPrompt);
                (0, Logger_1.log)('info', '[PromptGen] Prompt written to stdin, waiting for response...');
            });
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SEND_MESSAGE, async (_event, { projectId, content, replyToLocalId, attachments }) => {
            await this.chatOrchestrator.handleUserMessage(projectId, content, replyToLocalId, attachments);
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SAVE_ATTACHMENT, async (_event, { messageId, fileName, mimeType, dataBase64 }) => {
            try {
                const data = Buffer.from(dataBase64, 'base64');
                const attachment = AttachmentStorage_1.attachmentStorage.save({ messageId, fileName, mimeType, data });
                return { success: true, attachment };
            }
            catch (err) {
                (0, Logger_1.log)('error', `SAVE_ATTACHMENT failed: ${err.message}`);
                return { success: false, error: err.message };
            }
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_MESSAGES, async (_event, { projectId, limit, offset }) => {
            return LocalDatabase_1.localDatabase.getMessagesByProject(projectId, limit ?? 100, offset ?? 0);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_MESSAGE, async (_event, { messageId }) => {
            LocalDatabase_1.localDatabase.deleteMessage(messageId);
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.RETRY_MESSAGE, async (_event, { messageId }) => {
            await this.chatOrchestrator.retryMessage(messageId);
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.STOP_AGENT_CHAT, async (_event, { messageId }) => {
            const stopped = this.chatOrchestrator.stopMessageGeneration(messageId);
            return { success: stopped };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SET_AGENT_STOPPED, async (_event, { projectId, agentId, stopped }) => {
            const { killed } = this.chatOrchestrator.setAgentStopped(projectId, agentId, stopped);
            return { success: true, killed };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_SYNC_STATUS, async () => {
            return {
                isOnline: this.syncService.isOnline,
                isSyncing: this.syncService.isSyncing,
                unsyncedCount: LocalDatabase_1.localDatabase.getUnsyncedCount(),
                lastSyncAt: this.syncService.lastSyncAt?.toISOString() ?? null,
            };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.TRIGGER_FULL_SYNC, async () => {
            await this.syncService.fullSync();
            this.chatOrchestrator.loadProjects();
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.EXPORT_PDF, async (_event, { title, htmlContent }) => {
            return this.exportDocumentAsPdf(title, htmlContent);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.PICK_AND_READ_FILE, async (_event, args) => {
            const win = electron_1.BrowserWindow.getFocusedWindow() ?? electron_1.BrowserWindow.getAllWindows()[0];
            if (!win)
                return { canceled: true };
            const defaultFilters = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }];
            const result = await electron_1.dialog.showOpenDialog(win, {
                properties: ['openFile'],
                filters: args?.filters ?? defaultFilters,
            });
            if (result.canceled || result.filePaths.length === 0)
                return { canceled: true };
            const fs = require('fs');
            const path = require('path');
            const filePath = result.filePaths[0];
            const content = fs.readFileSync(filePath, 'utf-8');
            const fileName = path.basename(filePath);
            return { canceled: false, fileName, content };
        });
    }
    // ── PDF Export ───────────────────────────────────────────────────────────
    async exportDocumentAsPdf(title, htmlContent) {
        const fs = require('fs');
        const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
</html>`;
        // Create hidden window for PDF rendering
        const pdfWindow = new electron_1.BrowserWindow({
            show: false,
            width: 800,
            height: 600,
            webPreferences: { offscreen: true },
        });
        try {
            await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
            // Wait for CDN script to load and render
            await new Promise((r) => setTimeout(r, 1500));
            const pdfBuffer = await pdfWindow.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4',
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
            });
            const { filePath, canceled } = await electron_1.dialog.showSaveDialog(this.mainWindow, {
                defaultPath: `${title.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });
            if (canceled || !filePath)
                return { success: false };
            fs.writeFileSync(filePath, pdfBuffer);
            return { success: true };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            (0, Logger_1.log)('error', `PDF export failed: ${msg}`);
            return { success: false, error: msg };
        }
        finally {
            pdfWindow.close();
        }
    }
    // ── Ticket IPC Handlers ────────────────────────────────────────────────
    registerTicketIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_TICKETS, async (_event, { projectId }) => {
            return LocalDatabase_1.localDatabase.getTicketsGrouped(projectId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CREATE_TICKET, async (_event, { projectId, title, description, assignedAgentLocalId, assignedAgentName, category, attachments }) => {
            const ticketNumber = LocalDatabase_1.localDatabase.getNextTicketNumber(projectId);
            const ticket = {
                id: (0, crypto_1.randomUUID)(),
                projectId,
                ticketNumber,
                title,
                description,
                status: 'open',
                category: category,
                assignedAgentLocalId,
                assignedAgentName,
                sortOrder: Date.now(),
                comments: [],
                attachments: attachments && attachments.length > 0 ? attachments : undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            LocalDatabase_1.localDatabase.saveTicket(ticket);
            LocalDatabase_1.localDatabase.addToSyncQueue('ticket', ticket.id, 'create', ticket);
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'created', ticket });
            return ticket;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.UPDATE_TICKET, async (_event, { ticketId, projectId, updates }) => {
            LocalDatabase_1.localDatabase.updateTicket(ticketId, { ...updates, updatedAt: new Date().toISOString() }, projectId);
            LocalDatabase_1.localDatabase.addToSyncQueue('ticket', ticketId, 'update', { id: ticketId, ...updates });
            const ticket = LocalDatabase_1.localDatabase.getTicket(ticketId);
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'updated', ticket });
            return ticket;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_TICKET, async (_event, { ticketId, projectId }) => {
            LocalDatabase_1.localDatabase.deleteTicket(ticketId, projectId);
            LocalDatabase_1.localDatabase.addToSyncQueue('ticket', ticketId, 'delete', { id: ticketId });
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'deleted', ticketId });
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.ADD_TICKET_COMMENT, async (_event, { ticketId, projectId, content }) => {
            const comment = {
                id: (0, crypto_1.randomUUID)(),
                ticketId,
                projectId,
                authorType: 'user',
                content,
                clientTimestamp: new Date().toISOString(),
            };
            LocalDatabase_1.localDatabase.saveComment(comment);
            LocalDatabase_1.localDatabase.addToSyncQueue('ticket_comment', comment.id, 'create', comment);
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'comment-added', ticketId, comment });
            // Check for @mentions in comment — agent replies as ticket comment
            this.chatOrchestrator.handleTicketCommentMention(projectId, ticketId, content).catch(() => { });
            return comment;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.IMPORT_TICKETS, async (_event, { projectId, content }) => {
            return this.importTickets(projectId, content);
        });
    }
    /** JSON-Ticket-Import: ohne content öffnet ein Datei-Dialog (Drag&Drop liefert content direkt). */
    async importTickets(projectId, content) {
        let jsonText = content;
        if (!jsonText) {
            const win = electron_1.BrowserWindow.getFocusedWindow() ?? this.mainWindow;
            if (!win)
                return { success: false, canceled: true };
            const result = await electron_1.dialog.showOpenDialog(win, {
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (result.canceled || result.filePaths.length === 0)
                return { success: false, canceled: true };
            const fs = require('fs');
            jsonText = fs.readFileSync(result.filePaths[0], 'utf-8');
        }
        let raw;
        try {
            raw = JSON.parse(jsonText);
        }
        catch {
            return { success: false, errors: ['Datei enthält kein gültiges JSON'] };
        }
        // Validierungsfehler → Import komplett abbrechen
        const validation = (0, ticketImport_1.validateTicketImport)(raw);
        if (!validation.success) {
            return { success: false, errors: validation.errors };
        }
        const plan = (0, ticketImport_1.planTicketImport)(validation.data, {
            projectId,
            existingByExternalId: LocalDatabase_1.localDatabase.getTicketIdsByExternalId(projectId),
            agents: LocalDatabase_1.localDatabase.getAgentsByProject(projectId).map((a) => ({ id: a.id, name: a.name })),
            nextTicketNumber: LocalDatabase_1.localDatabase.getNextTicketNumber(projectId),
            now: new Date().toISOString(),
            generateId: crypto_1.randomUUID,
        });
        try {
            LocalDatabase_1.localDatabase.applyTicketImport(plan);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            (0, Logger_1.log)('error', `Ticket import failed: ${msg}`);
            return { success: false, errors: [`Import fehlgeschlagen: ${msg}`] };
        }
        (0, Logger_1.log)('info', `Ticket import: ${plan.inserts.length} created, ${plan.updates.length} updated, ${plan.warnings.length} warnings`);
        this.syncService.processSyncQueue().catch(() => { });
        for (const ticket of plan.inserts) {
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'created', ticket });
        }
        for (const { id } of plan.updates) {
            const ticket = LocalDatabase_1.localDatabase.getTicket(id);
            if (ticket)
                this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'updated', ticket });
        }
        return {
            success: true,
            imported: plan.inserts.length,
            updated: plan.updates.length,
            warnings: plan.warnings,
        };
    }
    // ── Document IPC Handlers ──────────────────────────────────────────────
    registerDocumentIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_DOCUMENTS, async (_event, { projectId }) => {
            return LocalDatabase_1.localDatabase.getDocumentsByProject(projectId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CREATE_DOCUMENT, async (_event, { projectId, title, content }) => {
            const now = new Date().toISOString();
            const doc = {
                id: (0, crypto_1.randomUUID)(),
                projectId,
                title,
                content,
                createdAt: now,
                updatedAt: now,
            };
            LocalDatabase_1.localDatabase.saveDocument(doc);
            LocalDatabase_1.localDatabase.addToSyncQueue('document', doc.id, 'create', doc);
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.DOCUMENT_UPDATE, { type: 'created', document: doc });
            return doc;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.UPDATE_DOCUMENT, async (_event, { documentId, projectId, updates }) => {
            LocalDatabase_1.localDatabase.updateDocument(documentId, updates, projectId);
            const doc = LocalDatabase_1.localDatabase.getDocument(documentId);
            if (doc) {
                LocalDatabase_1.localDatabase.addToSyncQueue('document', documentId, 'update', { id: documentId, ...updates });
                this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.DOCUMENT_UPDATE, { type: 'updated', document: doc });
            }
            return doc;
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_DOCUMENT, async (_event, { documentId, projectId }) => {
            LocalDatabase_1.localDatabase.deleteDocument(documentId, projectId);
            LocalDatabase_1.localDatabase.addToSyncQueue('document', documentId, 'delete', { id: documentId });
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.DOCUMENT_UPDATE, { type: 'deleted', documentId });
            return { success: true };
        });
    }
    // ── Goal IPC Handlers ───────────────────────────────────────────────────
    registerGoalIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.START_GOAL, async (_event, { projectId, description, selectedAgentIds }) => {
            return await this.autonomousLoopService.startGoal(projectId, description, selectedAgentIds);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.START_GOAL_FROM_TICKETS, async (_event, { projectId, ticketIds, selectedAgentIds }) => {
            return await this.autonomousLoopService.startSelectedTicketsGoal(projectId, ticketIds, selectedAgentIds);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_GOALS, async (_event, { projectId }) => {
            return LocalDatabase_1.localDatabase.getGoalsByProject(projectId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_GOAL_LOG, async (_event, { goalId }) => {
            return LocalDatabase_1.localDatabase.getGoalRunLog(goalId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CANCEL_GOAL, async (_event, { goalId }) => {
            this.autonomousLoopService.cancelGoal(goalId);
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.RETRY_GOAL, async (_event, { goalId }) => {
            return await this.autonomousLoopService.retryGoal(goalId);
        });
    }
    // ── Memory IPC Handlers ─────────────────────────────────────────────────
    registerMemoryIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_AGENT_MEMORIES, async (_event, { globalAgentId }) => {
            return this.memoryService.listMemories(globalAgentId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SAVE_AGENT_MEMORY, async (_event, { globalAgentId, projectId, key, value, importance }) => {
            this.memoryService.saveMemory(globalAgentId, projectId, key, value, importance, 'user');
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_AGENT_MEMORY, async (_event, { memoryId }) => {
            this.memoryService.deleteMemory(memoryId);
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.CLEAR_AGENT_MEMORIES, async (_event, { globalAgentId }) => {
            this.memoryService.clearAllMemories(globalAgentId);
            return { success: true };
        });
    }
    generateVerificationCode() {
        return String((0, crypto_1.randomInt)(100000, 1000000));
    }
    getCodeExpiresAt() {
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + Orchestrator.VERIFICATION_CODE_EXPIRY_MINUTES);
        return expires.toISOString();
    }
    validateRatingSubmission(data) {
        const errors = [];
        if (!data.projectId?.trim())
            errors.push('Project-ID ist erforderlich');
        if (!data.period || !Orchestrator.VALID_PERIODS.includes(data.period))
            errors.push('Ungültiger Zeitraum');
        if (!data.stayType || !Orchestrator.VALID_STAY_TYPES.includes(data.stayType))
            errors.push('Ungültige Aufenthaltsart');
        if (!data.impression || data.impression.length < Orchestrator.MIN_IMPRESSION_CHARS)
            errors.push(`Gesamteindruck muss mindestens ${Orchestrator.MIN_IMPRESSION_CHARS} Zeichen haben`);
        if (!data.categories || data.categories.length < 1)
            errors.push('Mindestens eine Kategorie erforderlich');
        if (data.categories?.some((c) => !Orchestrator.VALID_CATEGORIES.includes(c)))
            errors.push('Ungültige Kategorie enthalten');
        if (!data.title || data.title.length < Orchestrator.MIN_TITLE_CHARS)
            errors.push(`Titel muss mindestens ${Orchestrator.MIN_TITLE_CHARS} Zeichen haben`);
        if (!data.firstName?.trim())
            errors.push('Vorname ist erforderlich');
        if (!data.email?.trim()) {
            errors.push('E-Mail ist erforderlich');
        }
        else if (!Orchestrator.EMAIL_REGEX.test(data.email)) {
            errors.push('Ungültige E-Mail-Adresse');
        }
        if (!data.consent)
            errors.push('Zustimmung zu den Nutzungsbedingungen erforderlich');
        return errors;
    }
    registerRatingIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SUBMIT_RATING, async (_event, data) => {
            const errors = this.validateRatingSubmission(data);
            if (errors.length > 0) {
                return { success: false, errors };
            }
            const now = new Date().toISOString();
            const verificationCode = this.generateVerificationCode();
            const rating = {
                id: (0, crypto_1.randomUUID)(),
                projectId: data.projectId,
                period: data.period,
                stayType: data.stayType,
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
            };
            LocalDatabase_1.localDatabase.saveRating(rating);
            LocalDatabase_1.localDatabase.addToSyncQueue('rating', rating.id, 'create', { ...rating, verificationCode: undefined });
            (0, Logger_1.log)('info', `Rating ${rating.id} submitted for verification (email: ${rating.email})`);
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.RATING_UPDATE, { type: 'submitted', rating: { ...rating, verificationCode: undefined } });
            return { success: true, ratingId: rating.id };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.VERIFY_RATING, async (_event, { ratingId, code }) => {
            const attempts = this.verificationAttempts.get(ratingId);
            if (attempts && attempts.count >= Orchestrator.MAX_VERIFICATION_ATTEMPTS) {
                const elapsed = Date.now() - attempts.lastAttempt;
                if (elapsed < Orchestrator.VERIFICATION_LOCKOUT_MS) {
                    const remainingMin = Math.ceil((Orchestrator.VERIFICATION_LOCKOUT_MS - elapsed) / 60000);
                    return { success: false, error: `Zu viele Versuche. Bitte warte ${remainingMin} Minuten.` };
                }
                this.verificationAttempts.delete(ratingId);
            }
            const rating = LocalDatabase_1.localDatabase.getRating(ratingId);
            if (!rating) {
                return { success: false, error: 'Bewertung nicht gefunden' };
            }
            if (rating.status !== 'pending_verification') {
                return { success: false, error: 'Bewertung ist nicht im Verifizierungsstatus' };
            }
            if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
                return { success: false, error: 'Ungültiger Verifizierungscode (6 Ziffern erwartet)' };
            }
            if (rating.verificationCode !== code) {
                const current = this.verificationAttempts.get(ratingId) ?? { count: 0, lastAttempt: 0 };
                this.verificationAttempts.set(ratingId, { count: current.count + 1, lastAttempt: Date.now() });
                return { success: false, error: 'Falscher Verifizierungscode' };
            }
            this.verificationAttempts.delete(ratingId);
            const now = new Date().toISOString();
            LocalDatabase_1.localDatabase.updateRatingStatus(ratingId, 'published', now);
            LocalDatabase_1.localDatabase.addToSyncQueue('rating', ratingId, 'update', { id: ratingId, status: 'published', verifiedAt: now });
            (0, Logger_1.log)('info', `Rating ${ratingId} verified and published`);
            const updated = LocalDatabase_1.localDatabase.getRating(ratingId);
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.RATING_UPDATE, { type: 'verified', rating: updated });
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.RESEND_VERIFICATION, async (_event, { ratingId }) => {
            const rating = LocalDatabase_1.localDatabase.getRating(ratingId);
            if (!rating) {
                return { success: false, error: 'Bewertung nicht gefunden' };
            }
            if (rating.status !== 'pending_verification') {
                return { success: false, error: 'Bewertung ist nicht im Verifizierungsstatus' };
            }
            const newCode = this.generateVerificationCode();
            const now = new Date().toISOString();
            const updatedRating = { ...rating, verificationCode: newCode, updatedAt: now };
            LocalDatabase_1.localDatabase.saveRating(updatedRating);
            (0, Logger_1.log)('info', `Verification code resent for rating ${ratingId} (email: ${rating.email})`);
            return { success: true };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_RATINGS, async (_event, { projectId, status }) => {
            if (status) {
                return LocalDatabase_1.localDatabase.getRatingsByStatus(projectId, status);
            }
            return LocalDatabase_1.localDatabase.getRatingsByProject(projectId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.GET_RATING, async (_event, { ratingId }) => {
            return LocalDatabase_1.localDatabase.getRating(ratingId);
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.DELETE_RATING, async (_event, { ratingId, projectId }) => {
            LocalDatabase_1.localDatabase.deleteRating(ratingId, projectId);
            LocalDatabase_1.localDatabase.addToSyncQueue('rating', ratingId, 'delete', { id: ratingId });
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.RATING_UPDATE, { type: 'deleted', ratingId });
            return { success: true };
        });
    }
    // ── Email Verification IPC Handlers ─────────────────────────────────────
    registerEmailVerificationIpcHandlers() {
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.SEND_EMAIL_VERIFICATION, async (_event, { email }) => {
            if (!email?.trim()) {
                return { success: false, error: 'E-Mail ist erforderlich' };
            }
            if (!Orchestrator.EMAIL_REGEX.test(email)) {
                return { success: false, error: 'Ungültige E-Mail-Adresse' };
            }
            const code = this.generateVerificationCode();
            const now = new Date().toISOString();
            const verificationId = (0, crypto_1.randomUUID)();
            LocalDatabase_1.localDatabase.cleanupExpiredEmailVerifications();
            LocalDatabase_1.localDatabase.saveEmailVerification({
                id: verificationId,
                email: email.trim().toLowerCase(),
                code,
                maxAttempts: Orchestrator.MAX_VERIFICATION_ATTEMPTS,
                expiresAt: this.getCodeExpiresAt(),
                createdAt: now,
            });
            LocalDatabase_1.localDatabase.addToSyncQueue('email_verification', verificationId, 'create', {
                id: verificationId,
                email: email.trim().toLowerCase(),
                type: 'rating_verification',
            });
            (0, Logger_1.log)('info', `Email verification code sent for ${email} (id: ${verificationId})`);
            return { success: true, verificationId };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.VERIFY_EMAIL_CODE, async (_event, { verificationId, code }) => {
            const verification = LocalDatabase_1.localDatabase.getEmailVerification(verificationId);
            if (!verification) {
                return { success: false, error: 'Verifizierung nicht gefunden' };
            }
            if (verification.verifiedAt) {
                return { success: true, email: verification.email };
            }
            const now = new Date();
            if (now > new Date(verification.expiresAt)) {
                return { success: false, error: 'Der Verifizierungscode ist abgelaufen. Bitte fordern Sie einen neuen an.' };
            }
            if (verification.attempts >= verification.maxAttempts) {
                return { success: false, error: `Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.` };
            }
            if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
                return { success: false, error: 'Ungültiger Verifizierungscode (6 Ziffern erwartet)' };
            }
            if (verification.code !== code) {
                LocalDatabase_1.localDatabase.incrementEmailVerificationAttempts(verificationId);
                const remaining = verification.maxAttempts - verification.attempts - 1;
                return {
                    success: false,
                    error: remaining > 0
                        ? `Falscher Code. ${remaining} Versuch(e) verbleibend.`
                        : 'Falscher Code. Bitte fordern Sie einen neuen Code an.',
                };
            }
            LocalDatabase_1.localDatabase.markEmailVerified(verificationId);
            (0, Logger_1.log)('info', `Email ${verification.email} verified (id: ${verificationId})`);
            return { success: true, email: verification.email };
        });
        electron_1.ipcMain.handle(ipc_channels_1.IpcChannel.RESEND_EMAIL_VERIFICATION, async (_event, { verificationId }) => {
            const verification = LocalDatabase_1.localDatabase.getEmailVerification(verificationId);
            if (!verification) {
                return { success: false, error: 'Verifizierung nicht gefunden' };
            }
            if (verification.verifiedAt) {
                return { success: false, error: 'E-Mail ist bereits verifiziert' };
            }
            const newCode = this.generateVerificationCode();
            LocalDatabase_1.localDatabase.updateEmailVerificationCode(verificationId, newCode, this.getCodeExpiresAt());
            LocalDatabase_1.localDatabase.addToSyncQueue('email_verification', verificationId, 'create', {
                id: verificationId,
                email: verification.email,
                type: 'rating_verification',
            });
            (0, Logger_1.log)('info', `Email verification code resent for ${verification.email} (id: ${verificationId})`);
            return { success: true };
        });
    }
    // ── Sync Events ────────────────────────────────────────────────────────
    wireSyncEvents() {
        this.syncService.on('sync-completed', (data) => {
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.SYNC_STATUS_UPDATE, { type: 'completed', ...data });
        });
        this.syncService.on('connectivity-changed', (isOnline) => {
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.SYNC_STATUS_UPDATE, { type: 'connectivity', isOnline });
        });
        this.syncService.on('full-sync-completed', () => {
            this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.SYNC_STATUS_UPDATE, { type: 'full-sync-completed' });
        });
    }
    // ── Broadcast ───────────────────────────────────────────────────────────
    broadcastStateUpdate() {
        const currentState = this.getState();
        this.state = currentState;
        this.mainWindow?.webContents.send(ipc_channels_1.IpcChannel.STATE_UPDATE, currentState);
        this.emit('state-update', currentState);
    }
}
exports.Orchestrator = Orchestrator;
// ── Rating IPC Handlers ─────────────────────────────────────────────
Orchestrator.VALID_PERIODS = ['unter_1_monat', '1_3_monate', '3_6_monate', '6_12_monate', 'ueber_12_monate'];
Orchestrator.VALID_STAY_TYPES = ['stationiert', 'kommandiert', 'durchreise'];
Orchestrator.VALID_CATEGORIES = ['sauberkeit', 'ausstattung', 'lage', 'service', 'verpflegung', 'atmosphaere', 'sicherheit', 'preis_leistung'];
Orchestrator.EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
Orchestrator.MIN_IMPRESSION_CHARS = 100;
Orchestrator.MIN_TITLE_CHARS = 100;
Orchestrator.MAX_VERIFICATION_ATTEMPTS = 5;
Orchestrator.VERIFICATION_LOCKOUT_MS = 15 * 60 * 1000;
Orchestrator.VERIFICATION_CODE_EXPIRY_MINUTES = 10;
// ── Singleton export ────────────────────────────────────────────────────────
exports.orchestrator = new Orchestrator();
//# sourceMappingURL=Orchestrator.js.map
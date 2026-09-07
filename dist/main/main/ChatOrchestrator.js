"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatOrchestrator = exports.AgentStoppedError = exports.RateLimitError = void 0;
const electron_1 = require("electron");
const crypto_1 = require("crypto");
const events_1 = require("events");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const MemoryService_1 = require("./services/MemoryService");
const MentionParser_1 = require("./MentionParser");
const ClaudeProcessManager_1 = require("./ClaudeProcessManager");
const Logger_1 = require("./Logger");
const ipc_channels_1 = require("../shared/ipc-channels");
const constants_1 = require("../shared/constants");
class RateLimitError extends Error {
    constructor(message, retryAfterMs = 60000) {
        super(message);
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}
exports.RateLimitError = RateLimitError;
/** Thrown when work is dispatched to an agent the user has stopped. */
class AgentStoppedError extends Error {
    constructor(agentName) {
        super(`Agent ${agentName} ist gestoppt`);
        this.name = 'AgentStoppedError';
        this.agentName = agentName;
    }
}
exports.AgentStoppedError = AgentStoppedError;
const MAX_AGENT_CHAIN_DEPTH = 5;
/**
 * How many turns one Claude session is reused before the next run starts fresh.
 * Resuming keeps the explored repo warm in the prompt cache; but a transcript that grows without
 * bound eventually costs more than re-reading, so the session is retired after this many turns.
 */
const MAX_SESSION_TURNS = 12;
class ChatOrchestrator extends events_1.EventEmitter {
    constructor(db, syncService) {
        super();
        this.projects = new Map();
        this.activeAgentSessions = new Map();
        this.activeClaudeProcesses = new Map();
        this.userStoppedMessages = new Set();
        /**
         * Scope keys with a Claude process running right now. Since ticket work no longer scopes per
         * ticket, the worker pool can put two tickets of the SAME agent+goal in flight at once — and a
         * Claude session must not be resumed by two processes concurrently. The second run goes cold.
         */
        this.busyScopeKeys = new Set();
        this.mainWindow = null;
        this.db = db;
        this.syncService = syncService;
        this.memoryService = new MemoryService_1.MemoryService(db);
    }
    setMainWindow(win) {
        this.mainWindow = win;
    }
    initialize() {
        this.loadProjects();
        (0, Logger_1.log)('info', 'ChatOrchestrator initialized');
    }
    loadProjects() {
        const projects = this.db.getAllProjects();
        this.projects.clear();
        for (const project of projects) {
            project.agents = this.db.getAgentsByProject(project.id);
            this.projects.set(project.id, project);
        }
        return projects;
    }
    getProject(id) {
        return this.projects.get(id) ?? null;
    }
    // ── User Message Handling ──────────────────────────────────────────────────
    // `promptOverride`, when set, is the text actually sent to Claude for autonomous runs, while
    // `content` is what gets saved/displayed as the chat message. This lets the goal loop show a short
    // line ("Arbeite Ticket #1 ab") in the chat while still giving the agent the full ticket context —
    // the full context is transient (never stored), so the ticket body is not duplicated into the chat.
    async handleUserMessage(projectId, content, replyToLocalId, attachments, metadata, promptOverride) {
        const project = this.projects.get(projectId);
        if (!project) {
            (0, Logger_1.log)('error', `Project ${projectId} not found`);
            return;
        }
        // 1. Create user message
        const message = {
            id: (0, crypto_1.randomUUID)(),
            projectId,
            role: 'user',
            content,
            mentions: MentionParser_1.mentionParser.extractMentions(content),
            replyToLocalId,
            metadata,
            attachments: attachments && attachments.length > 0 ? attachments : undefined,
            status: 'done',
            clientTimestamp: new Date().toISOString(),
        };
        // 2. Save locally first
        this.db.saveMessage(message);
        this.db.addToSyncQueue('message', message.id, 'create', message);
        // 3. Send to renderer
        this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, message);
        // 4. Resolve mentions to agents
        const allMentionedAgents = MentionParser_1.mentionParser.resolveMentionsToAgents(message.mentions, project.agents);
        // 4b. Drop agents the user has stopped — they must not receive any new work.
        const stoppedAgents = allMentionedAgents.filter((a) => this.isAgentStopped(projectId, a.id));
        const mentionedAgents = allMentionedAgents.filter((a) => !stoppedAgents.includes(a));
        if (stoppedAgents.length > 0) {
            const names = stoppedAgents.map((a) => a.name).join(', ');
            (0, Logger_1.log)('info', `[Chat] Skipping stopped agent(s): ${names}`);
            const stoppedMsg = {
                id: (0, crypto_1.randomUUID)(),
                projectId,
                role: 'agent',
                agentName: 'System',
                content: `⏹ ${names} ${stoppedAgents.length === 1 ? 'ist' : 'sind'} gestoppt und ${stoppedAgents.length === 1 ? 'wurde' : 'wurden'} nicht gestartet. Im Agenten-Panel wieder fortsetzen.`,
                mentions: [],
                status: 'done',
                clientTimestamp: new Date().toISOString(),
            };
            this.db.saveMessage(stoppedMsg);
            this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, stoppedMsg);
            // The autonomous loop must not read "no response" as "ticket done" — surface it as an error
            // so the ticket goes back to 'open' instead of being silently marked complete.
            if (metadata?.triggered_by === 'goal_loop') {
                throw new AgentStoppedError(names);
            }
            if (mentionedAgents.length === 0)
                return;
        }
        if (allMentionedAgents.length === 0 && project.agents.length > 0) {
            // No agents mentioned, send hint
            const hintMessage = {
                id: (0, crypto_1.randomUUID)(),
                projectId,
                role: 'agent',
                agentName: 'System',
                content: `Sprich einen Agenten an: ${project.agents.map((a) => a.mentionKey).join(', ')}`,
                mentions: [],
                status: 'done',
                clientTimestamp: new Date().toISOString(),
            };
            this.db.saveMessage(hintMessage);
            this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, hintMessage);
            return;
        }
        // 5. Run all mentioned agents in parallel
        const isAutonomous = metadata?.triggered_by === 'goal_loop';
        await Promise.all(mentionedAgents.map((agent) => this.runAgent(project, agent, message, 0, isAutonomous, metadata, promptOverride)));
    }
    // ── Agent Execution ────────────────────────────────────────────────────────
    async runAgent(project, agent, triggerMessage, depth, autonomous, metadata, promptOverride) {
        if (depth >= MAX_AGENT_CHAIN_DEPTH) {
            const warningMsg = {
                id: (0, crypto_1.randomUUID)(),
                projectId: project.id,
                role: 'agent',
                agentName: 'System',
                content: '⚠️ Maximale Agenten-Kette erreicht. Keine weiteren Agenten werden aufgerufen.',
                mentions: [],
                status: 'done',
                clientTimestamp: new Date().toISOString(),
            };
            this.db.saveMessage(warningMsg);
            this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, warningMsg);
            return;
        }
        // Hard guard: a stopped agent never spawns a Claude process. handleUserMessage already
        // filters mentions, but chained mentions call runAgent directly — so re-check here.
        if (this.isAgentStopped(project.id, agent.id)) {
            (0, Logger_1.log)('info', `[Chat] runAgent skipped — agent ${agent.name} is stopped`);
            return;
        }
        // Set agent to thinking
        agent.status = 'thinking';
        this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'thinking' });
        // Build exec metadata (cwd + model) up-front so we can also decide whether this run will
        // resume an existing Claude session. The Projektpfad is configured in Project Settings and
        // stored in project.metadata.project_path (NOT per-message metadata) — merge it in so every
        // agent runs Claude with cwd = the project path.
        const projectPath = project.metadata?.project_path?.trim();
        const execMetadata = { ...metadata };
        if (projectPath)
            execMetadata.project_path = projectPath;
        // Per-agent model + effort selection (chat + autonomous workers both go through here).
        execMetadata.model = agent.model?.trim() || constants_1.DEFAULT_AGENT_MODEL;
        execMetadata.effort = agent.effort?.trim() || constants_1.DEFAULT_AGENT_EFFORT;
        // When a session will be resumed, the system prompt + the large fixed instruction blocks
        // (ticket/document/memory systems, comm rules) and the deep history already live in that
        // session. Re-sending them every turn is the biggest avoidable token cost, so on resume we
        // send a slim prompt with only the dynamic context (current tickets/docs/memory, thread,
        // recent messages) plus the new task.
        const willResume = !!this.getResumeSessionId(project.id, agent.id, execMetadata);
        // In autonomous (goal_loop) mode, skip heavy context to save tokens.
        // The goal prompt already contains all necessary context (Pflichtenheft, tickets, docs).
        let prompt;
        if (autonomous) {
            // Minimal prompt: system prompt + the full task text. promptOverride carries the self-contained
            // worker prompt (ticket body + rules) so the agent has full context, while the stored/displayed
            // chat message (triggerMessage.content) stays a short reference like "Arbeite Ticket #1 ab".
            const taskText = promptOverride ?? triggerMessage.content;
            // Long-term memory belongs here too, not just in interactive chat. This is where the agent
            // does its repo work, so the durable facts it learned earlier ("Auth lebt in X", "Migrations
            // laufen über Y") are exactly what saves it from re-discovering the codebase every goal.
            let autonomousMemory = '';
            if (agent.globalAgentId) {
                const memories = this.memoryService.getMemoriesForPrompt(agent.globalAgentId, project.id);
                autonomousMemory = this.memoryService.buildMemoryBlock(memories);
            }
            prompt = willResume
                // The session already holds the system prompt from turn 1 — re-sending it every ticket is
                // pure waste. Memory still goes along: it may have changed since the session started.
                ? `${autonomousMemory}${taskText}`
                : `<system>\n${agent.systemPrompt}\n</system>\n${autonomousMemory}\n${taskText}`;
        }
        else {
            // Build full context for interactive chat
            const allMessages = this.db.getMessagesByProject(project.id, 50);
            let threadContext;
            let threadMessages;
            if (triggerMessage.replyToLocalId) {
                const parentMsg = this.db.getMessageById(triggerMessage.replyToLocalId);
                if (parentMsg) {
                    const replies = this.db.getThreadMessages(parentMsg.id);
                    threadContext = { parentMessage: parentMsg, replies };
                    threadMessages = [parentMsg, ...replies];
                }
            }
            else {
                const existingReplies = this.db.getThreadMessages(triggerMessage.id);
                if (existingReplies.length > 0) {
                    threadContext = { parentMessage: triggerMessage, replies: existingReplies };
                    threadMessages = [triggerMessage, ...existingReplies];
                }
            }
            const contextMessages = MentionParser_1.mentionParser.buildAgentContext(agent, allMessages, triggerMessage.id, threadMessages);
            const ticketsSummary = this.db.getTicketsSummaryForAgent(project.id);
            let metadataContext = '';
            if (project.metadata && Object.keys(project.metadata).length > 0) {
                const entries = Object.entries(project.metadata)
                    .filter(([, v]) => v && v.trim())
                    .map(([k, v]) => `- ${k}: ${v}`)
                    .join('\n');
                if (entries) {
                    metadataContext = `\n\n<project-info>\nProject: ${project.name}\n${entries}\n</project-info>\n`;
                }
            }
            const documentsSummary = this.db.getDocumentsSummaryForAgent(project.id);
            let memoryBlock;
            if (agent.globalAgentId) {
                const memories = this.memoryService.getMemoriesForPrompt(agent.globalAgentId, project.id);
                const block = this.memoryService.buildMemoryBlock(memories);
                if (block)
                    memoryBlock = block;
            }
            prompt = willResume
                // Session already holds the system prompt, fixed instructions and deep history — send only
                // the dynamic delta. Recent messages trimmed to the tail (the session has the rest); this
                // still carries messages from the user / other agents that arrived since the last turn.
                ? MentionParser_1.mentionParser.buildResumePromptForAgent(agent, contextMessages.slice(-15), triggerMessage, ticketsSummary || undefined, metadataContext, documentsSummary || undefined, threadContext, memoryBlock)
                : MentionParser_1.mentionParser.buildPromptForAgent(agent, contextMessages, triggerMessage, project.agents, ticketsSummary || undefined, metadataContext, documentsSummary || undefined, threadContext, memoryBlock);
        }
        // Create empty agent response message
        const agentMessage = {
            id: (0, crypto_1.randomUUID)(),
            projectId: project.id,
            role: 'agent',
            agentLocalId: agent.id,
            agentName: agent.name,
            content: '',
            mentions: [],
            replyToLocalId: triggerMessage.id,
            status: 'streaming',
            clientTimestamp: new Date().toISOString(),
        };
        this.db.saveMessage(agentMessage);
        this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, agentMessage);
        // Track session
        const sessionId = (0, crypto_1.randomUUID)();
        const session = {
            sessionId,
            projectId: project.id,
            agentId: agent.id,
            messageId: agentMessage.id,
            depth,
            startedAt: new Date(),
        };
        this.activeAgentSessions.set(sessionId, session);
        agent.status = 'responding';
        this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'responding' });
        const goalId = metadata?.goal_id ? parseInt(metadata.goal_id, 10) : undefined;
        // Prepend attachment block so Claude can read user-supplied images
        if (triggerMessage.attachments && triggerMessage.attachments.length > 0) {
            const lines = triggerMessage.attachments.map((a) => `- ${a.localPath} (${a.mimeType}, ${a.fileName})`).join('\n');
            prompt = `<user-attachments>\nDie folgenden Bilder hat der Nutzer angehängt. Lies sie mit deinem Read-Tool und beziehe sie in deine Antwort ein:\n${lines}\n</user-attachments>\n\n${prompt}`;
        }
        try {
            // Send to Claude (execMetadata with cwd + model was built above)
            let fullContent = await this.executeClaudePrompt(prompt, agentMessage, sessionId, execMetadata);
            // Process memory commands (strip from displayed content)
            if (agent.globalAgentId) {
                fullContent = this.memoryService.processAgentCommands(fullContent, agent.globalAgentId, project.id);
            }
            // Process ticket creation commands (before cleaning content)
            const createdTickets = this.processTicketCreation(project, agent, fullContent, goalId);
            // Process ticket references (auto-comment + status updates)
            this.processTicketReferences(project, agent, fullContent);
            // Process document save commands
            const savedDocs = this.processDocumentSave(project, agent, fullContent);
            // Parse and strip goal command tags
            const goalCompleteMatch = fullContent.match(/\[GOAL_COMPLETE:\s*(.+?)\]/s);
            const goalRetryMatch = fullContent.match(/\[GOAL_RETRY:\s*(.+?)\]/s);
            if (goalCompleteMatch || goalRetryMatch) {
                const goalMeta = {};
                if (goalCompleteMatch)
                    goalMeta.goal_complete = goalCompleteMatch[1].trim();
                if (goalRetryMatch)
                    goalMeta.goal_retry = goalRetryMatch[1].trim();
                agentMessage.metadata = { ...agentMessage.metadata, ...goalMeta };
            }
            fullContent = fullContent
                .replace(/\[GOAL_COMPLETE:\s*.+?\]/gs, '')
                .replace(/\[GOAL_RETRY:\s*.+?\]/gs, '')
                .trim();
            // Clean displayed content: replace tags with confirmations
            let displayContent = fullContent;
            displayContent = this.replaceTicketCreateTags(displayContent, createdTickets);
            displayContent = this.replaceDocSaveTags(displayContent, savedDocs);
            // Update final message
            agentMessage.content = displayContent;
            agentMessage.status = 'done';
            this.db.updateMessageContent(agentMessage.id, displayContent, 'done', agentMessage.thinkingContent);
            if (agentMessage.metadata) {
                this.db.updateMessageMetadata(agentMessage.id, agentMessage.metadata);
            }
            this.db.addToSyncQueue('message', agentMessage.id, 'create', agentMessage);
            this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, agentMessage);
            // Agent done
            agent.status = 'idle';
            this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'idle' });
            // Desktop notification if window is not focused
            this.showAgentDoneNotification(agent, fullContent);
            // The agent was stopped mid-run: the content above is a partial answer from a killed
            // process, not a finished job. Keep it in the chat, but never let it chain onward — and
            // in the goal loop, surface it as an error so the ticket is NOT marked done.
            if (this.isAgentStopped(project.id, agent.id)) {
                (0, Logger_1.log)('info', `[Chat] ${agent.name} was stopped mid-run — no chaining, no completion`);
                if (autonomous)
                    throw new AgentStoppedError(agent.name);
                return;
            }
            // In autonomous mode, skip chain detection entirely — the loop orchestrates agents directly
            if (!autonomous) {
                // Check for chain mentions in response
                const responseMentions = MentionParser_1.mentionParser.extractMentions(fullContent);
                const chainAgents = MentionParser_1.mentionParser.resolveMentionsToAgents(responseMentions, project.agents)
                    .filter((a) => a.id !== agent.id); // Don't self-trigger
                // If the agent is asking the user a question, pause the chain
                const asksUser = this.detectsUserQuestion(fullContent);
                // Detect if the response is just a completion/confirmation message (no real work to chain)
                const isCompletionMessage = this.detectsCompletionMessage(fullContent);
                if (chainAgents.length > 0 && (asksUser || isCompletionMessage)) {
                    if (asksUser) {
                        (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} is asking the user a question — pausing chain (${chainAgents.length} pending agents skipped)`);
                        const pauseMsg = {
                            id: (0, crypto_1.randomUUID)(),
                            projectId: project.id,
                            role: 'agent',
                            agentName: 'System',
                            content: `⏸ Agenten-Kette pausiert — ${agent.name} wartet auf deine Antwort.`,
                            mentions: [],
                            status: 'done',
                            clientTimestamp: new Date().toISOString(),
                        };
                        this.db.saveMessage(pauseMsg);
                        this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, pauseMsg);
                    }
                    else {
                        (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} sent a completion/handoff message — stopping chain to prevent ping-pong`);
                    }
                }
                else if (chainAgents.length > 0) {
                    (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} triggered ${chainAgents.length} agent(s): ${chainAgents.map((a) => a.name).join(', ')}`);
                    await Promise.all(chainAgents.map((chainAgent) => this.runAgent(project, chainAgent, agentMessage, depth + 1)));
                }
            }
        }
        catch (err) {
            // Stop switch: the message is already persisted with its partial content — don't rewrite it
            // as an error, just hand the signal to the autonomous loop so the ticket stays open.
            if (err instanceof AgentStoppedError) {
                agent.status = 'idle';
                this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'idle', stopped: true });
                throw err;
            }
            // Re-throw RateLimitError so the autonomous loop can handle it
            if (err instanceof RateLimitError) {
                agent.status = 'idle';
                this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'idle' });
                // Clean up the streaming message
                agentMessage.status = 'error';
                agentMessage.errorCode = 'unknown';
                agentMessage.content = agentMessage.content || `Rate limit erreicht — System pausiert automatisch.`;
                this.db.updateMessageContent(agentMessage.id, agentMessage.content, 'error', agentMessage.thinkingContent);
                this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, agentMessage);
                throw err;
            }
            agentMessage.status = 'error';
            // Determine error code and user-friendly message
            const errMsg = err instanceof Error ? err.message : String(err);
            let errorCode = 'unknown';
            let friendlyMessage = `Fehler: ${errMsg}`;
            if (errMsg.includes('Timeout')) {
                errorCode = 'timeout';
                friendlyMessage = 'Der Agent hat nicht rechtzeitig geantwortet (Timeout nach 15 Minuten ohne Aktivität).';
            }
            else if (errMsg.includes('konnte nicht gestartet werden')) {
                errorCode = 'spawn_failed';
                friendlyMessage = 'Claude konnte nicht gestartet werden. Prüfe, ob Claude CLI installiert ist.';
            }
            else if (errMsg.includes('beendet mit Code')) {
                errorCode = 'exit_code';
                friendlyMessage = `Der Agent-Prozess wurde unerwartet beendet. (${errMsg})`;
            }
            // Even on error, process ticket commands if we got content
            let errorContent = agentMessage.content || friendlyMessage;
            if (agentMessage.content) {
                const createdTickets = this.processTicketCreation(project, agent, agentMessage.content, goalId);
                this.processTicketReferences(project, agent, agentMessage.content);
                errorContent = this.replaceTicketCreateTags(errorContent, createdTickets);
                // If content only had ticket commands and they succeeded, treat as done
                if (createdTickets.length > 0 && errorContent.trim().length > 0) {
                    agentMessage.content = errorContent;
                    agentMessage.status = 'done';
                    this.db.updateMessageContent(agentMessage.id, errorContent, 'done', agentMessage.thinkingContent);
                    this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, agentMessage);
                    agent.status = 'idle';
                    this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'idle' });
                    return;
                }
            }
            agentMessage.content = errorContent;
            agentMessage.errorCode = errorCode;
            this.db.updateMessageContent(agentMessage.id, agentMessage.content, 'error', agentMessage.thinkingContent);
            this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, agentMessage);
            agent.status = 'idle';
            this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId: project.id, agentId: agent.id, status: 'idle' });
            // Notification on error too
            if (!this.mainWindow || !this.mainWindow.isFocused()) {
                if (electron_1.Notification.isSupported()) {
                    const notification = new electron_1.Notification({
                        title: `${agent.name} – Fehler`,
                        body: friendlyMessage,
                        silent: false,
                    });
                    notification.on('click', () => {
                        this.mainWindow?.show();
                        this.mainWindow?.focus();
                    });
                    notification.show();
                }
            }
        }
        finally {
            this.activeAgentSessions.delete(sessionId);
        }
    }
    buildClaudeScopeKey(projectId, agentLocalId, metadata) {
        const goalId = metadata?.goal_id;
        const base = `${projectId}:${agentLocalId ?? 'unknown'}`;
        // Deliberately NOT scoped per ticket. One session per (project, agent, goal) lets the agent
        // keep the repo it already explored — the alternative is a cold start per ticket, where the
        // full CLAUDE.md and every file read is paid again at full price. A resumed session re-reads
        // that same context from the prompt cache instead. MAX_SESSION_TURNS bounds the growth.
        return goalId ? `${base}:goal:${goalId}` : base;
    }
    /**
     * Returns the resumable Claude session id for this scope, or null for a cold start.
     * Mirrors the cwd-match rule in executeClaudePrompt so both agree on resume-vs-fresh —
     * runAgent uses this to decide how much context to (re)send.
     */
    getResumeSessionId(projectId, agentLocalId, metadata) {
        const projectCwd = metadata?.project_path?.trim();
        const scopeKey = this.buildClaudeScopeKey(projectId, agentLocalId, metadata);
        const cached = this.db.getClaudeSession(scopeKey);
        if (!cached)
            return null;
        if (cached.turnCount >= MAX_SESSION_TURNS)
            return null;
        // Must mirror executeClaudePrompt exactly: if it will start cold, the caller has to send the
        // full prompt (system block included), not the slim resume variant.
        if (this.busyScopeKeys.has(scopeKey))
            return null;
        return (cached.cwd ?? null) === (projectCwd ?? null) ? cached.sessionId : null;
    }
    executeClaudePrompt(prompt, agentMessage, _sessionId, metadata) {
        return new Promise((resolve, reject) => {
            let fullContent = '';
            let thinkingContent = '';
            const claudePath = ClaudeProcessManager_1.claudeProcessManager['claudePath'] || 'claude';
            const env = { ...process.env };
            delete env.CLAUDECODE;
            const projectCwd = metadata?.project_path?.trim();
            // Fail fast with a clear message if the configured Projektpfad is missing/not a directory,
            // instead of letting spawn throw an opaque ENOENT.
            if (projectCwd && (!(0, fs_1.existsSync)(projectCwd) || !(0, fs_1.statSync)(projectCwd).isDirectory())) {
                reject(new Error(`Projektpfad existiert nicht oder ist kein Verzeichnis: "${projectCwd}". Bitte in den Projekteinstellungen korrigieren.`));
                return;
            }
            // ── Session resume ──────────────────────────────────────────────────
            // Bind a Claude CLI session to (project, agent[, goal]) so follow-up prompts
            // reuse warm context + prompt cache instead of re-discovering the repo every time.
            const scopeKey = this.buildClaudeScopeKey(agentMessage.projectId, agentMessage.agentLocalId, metadata);
            const cached = this.db.getClaudeSession(scopeKey);
            const cwdMatches = cached ? (cached.cwd ?? null) === (projectCwd ?? null) : false;
            // Retire a session that has served enough turns — its transcript would otherwise grow
            // unbounded across a long goal. The next run cold-starts and becomes the new warm session.
            const exhausted = !!cached && cached.turnCount >= MAX_SESSION_TURNS;
            // Another run of the same agent+goal is already using this session: resuming it a second
            // time in parallel would have both processes writing the same transcript.
            const scopeBusy = this.busyScopeKeys.has(scopeKey);
            const resumeId = cached && cwdMatches && !exhausted && !scopeBusy ? cached.sessionId : null;
            // Turn number this run represents: continuing the cached session, or starting a new count.
            const turnCount = resumeId ? cached.turnCount + 1 : 1;
            if (scopeBusy) {
                (0, Logger_1.log)('info', `[Chat] Scope ${scopeKey} is already in flight — this run starts cold and will not claim the session`);
            }
            if (cached && !cwdMatches) {
                (0, Logger_1.log)('info', `[Chat] Dropping cached session ${cached.sessionId} for ${scopeKey} (cwd mismatch)`);
                this.db.deleteClaudeSession(scopeKey);
            }
            else if (exhausted) {
                // Keep the row — the successful close below overwrites it with the new session id.
                (0, Logger_1.log)('info', `[Chat] Session for ${scopeKey} retired after ${cached.turnCount} turns — starting fresh`);
            }
            // Model is configured per agent (metadata.model, a CLI alias like 'sonnet'/'opus'/'haiku').
            // Falls back to DEFAULT_AGENT_MODEL so a missing value never breaks the spawn.
            const model = metadata?.model?.trim() || constants_1.DEFAULT_AGENT_MODEL;
            // Effort is the second per-agent cost dial (see DEFAULT_AGENT_EFFORT). Without the flag the
            // CLI would run at its own default ('xhigh'), which is the most expensive sensible setting.
            // Resolved against the model: older models reject the parameter (or the 'xhigh' level), and
            // sending it anyway would fail the whole run.
            const effort = (0, constants_1.resolveEffortForModel)(model, metadata?.effort?.trim() || constants_1.DEFAULT_AGENT_EFFORT);
            const args = [
                '-p',
                '--model', model,
                ...(effort ? ['--effort', effort] : []),
                '--verbose', '--output-format', 'stream-json', '--include-partial-messages', '--dangerously-skip-permissions',
            ];
            if (resumeId) {
                args.push('--resume', resumeId);
                (0, Logger_1.log)('info', `[Chat] Resuming claude session ${resumeId} for ${scopeKey}`);
            }
            else {
                (0, Logger_1.log)('info', `[Chat] Starting fresh claude session for ${scopeKey}`);
            }
            (0, Logger_1.log)('info', `[Chat] Spawning claude -p for agent message ${agentMessage.id}`);
            const proc = (0, child_process_1.spawn)(claudePath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env,
                cwd: projectCwd || undefined,
            });
            if (projectCwd) {
                (0, Logger_1.log)('info', `[Chat] Using project cwd: ${projectCwd}`);
            }
            // Track the latest session_id reported by the CLI (init event or final result).
            // Saved on successful close so follow-up prompts can --resume it.
            let observedSessionId = null;
            // Track the process so it can be killed on goal cancel
            const goalId = metadata?.goal_id;
            const processKey = goalId ? `${agentMessage.id}:goal:${goalId}` : agentMessage.id;
            this.activeClaudeProcesses.set(processKey, {
                proc,
                messageId: agentMessage.id,
                agentLocalId: agentMessage.agentLocalId,
                projectId: agentMessage.projectId,
            });
            // Claim the scope for the lifetime of this process (see busyScopeKeys). Only the run that
            // actually owns the session claims it; a parallel cold run must not, or it would release
            // the claim out from under the owner when it finishes first.
            const ownsScope = !scopeBusy;
            if (ownsScope)
                this.busyScopeKeys.add(scopeKey);
            const releaseScope = () => { if (ownsScope)
                this.busyScopeKeys.delete(scopeKey); };
            let outputBuffer = '';
            let stderrBuffer = '';
            // Activity-based timeout: resets on every data chunk so active agents never time out
            const IDLE_TIMEOUT = 900000; // 15 minutes max idle time
            let activityTimeout = setTimeout(onTimeout, IDLE_TIMEOUT);
            function resetTimeout() {
                clearTimeout(activityTimeout);
                activityTimeout = setTimeout(onTimeout, IDLE_TIMEOUT);
            }
            function onTimeout() {
                proc.kill('SIGKILL');
                if (fullContent) {
                    resolve(fullContent);
                }
                else {
                    reject(new Error('Timeout: Keine Antwort von Claude (15 Min. ohne Aktivität).'));
                }
            }
            const sendUpdate = () => {
                this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, {
                    ...agentMessage,
                    content: fullContent,
                    thinkingContent: thinkingContent || undefined,
                });
            };
            proc.stdout.on('data', (chunk) => {
                resetTimeout();
                outputBuffer += chunk.toString();
                const lines = outputBuffer.split('\n');
                outputBuffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        // Capture session_id from any event that carries it (system/init or result).
                        // We always remember the latest — Claude Code may rotate ids on resume.
                        if (typeof parsed.session_id === 'string' && parsed.session_id) {
                            observedSessionId = parsed.session_id;
                        }
                        // Assistant message — each event contains full accumulated content blocks
                        if (parsed.type === 'assistant') {
                            const contentBlocks = parsed.message?.content ?? parsed.content;
                            if (Array.isArray(contentBlocks)) {
                                let newThinking = '';
                                let newText = '';
                                for (const block of contentBlocks) {
                                    if (block.type === 'thinking' && typeof block.thinking === 'string') {
                                        newThinking += block.thinking;
                                    }
                                    else if (block.type === 'text' && typeof block.text === 'string') {
                                        newText += block.text;
                                    }
                                }
                                // Replace (not append) — each assistant event has full content so far
                                if (newThinking && newThinking !== thinkingContent) {
                                    thinkingContent = newThinking;
                                    agentMessage.thinkingContent = thinkingContent;
                                }
                                if (newText && newText !== fullContent) {
                                    fullContent = newText;
                                    agentMessage.content = fullContent;
                                }
                                sendUpdate();
                            }
                            else if (typeof contentBlocks === 'string') {
                                fullContent = contentBlocks;
                                agentMessage.content = fullContent;
                                sendUpdate();
                            }
                        }
                        // Tool-Use-Events erkennen – breite Erkennung für verschiedene CLI-Formate
                        const toolName = 
                        // content_block_start mit tool_use
                        (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use' && parsed.content_block?.name) ||
                            // Direkter tool_use Event
                            (parsed.type === 'tool_use' && (parsed.name || parsed.tool)) ||
                            // Subtype-basiert (manche CLI-Versionen)
                            (parsed.subtype === 'tool_use' && (parsed.name || parsed.tool_name)) ||
                            // content Array in assistant Events durchsuchen
                            (parsed.type === 'assistant' && Array.isArray(parsed.content) &&
                                parsed.content.find((b) => b.type === 'tool_use')?.name) ||
                            // tool_use in message content
                            (parsed.message?.content && Array.isArray(parsed.message.content) &&
                                parsed.message.content.find((b) => b.type === 'tool_use')?.name) ||
                            null;
                        if (toolName) {
                            (0, Logger_1.log)('info', `[Chat] Tool detected: ${toolName}`);
                            this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, {
                                projectId: agentMessage.projectId,
                                agentId: agentMessage.agentLocalId,
                                status: 'responding',
                                currentTool: toolName,
                            });
                        }
                        // Tool-Ergebnis -> Tool abgeschlossen
                        if (parsed.type === 'tool_result' || parsed.type === 'content_block_stop' ||
                            parsed.subtype === 'tool_result') {
                            this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, {
                                projectId: agentMessage.projectId,
                                agentId: agentMessage.agentLocalId,
                                status: 'responding',
                                currentTool: undefined,
                            });
                        }
                        // Detect rate limit from explicit error events in stream-json
                        if (parsed.type === 'error' && parsed.error) {
                            const errText = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
                            if (/rate[_\s-]?limit|429|too many requests|over[_\s-]?quota|resource[_\s-]?exhausted/i.test(errText)) {
                                stderrBuffer += ` ${errText}`; // Let the close handler detect it
                            }
                        }
                        if (parsed.type === 'result') {
                            // Result can be a string or contain a content blocks array
                            const resultField = parsed.result ?? parsed.content;
                            if (typeof resultField === 'string') {
                                fullContent = resultField;
                            }
                            else if (Array.isArray(resultField)) {
                                let textResult = '';
                                for (const block of resultField) {
                                    if (block.type === 'text' && typeof block.text === 'string') {
                                        textResult += block.text;
                                    }
                                    else if (block.type === 'thinking' && typeof block.thinking === 'string' && !thinkingContent) {
                                        thinkingContent = block.thinking;
                                        agentMessage.thinkingContent = thinkingContent;
                                    }
                                }
                                if (textResult)
                                    fullContent = textResult;
                            }
                            (0, Logger_1.log)('info', `[Chat] Result received, length: ${fullContent.length}`);
                        }
                    }
                    catch {
                        // non-JSON line, ignore
                    }
                }
            });
            proc.stderr.on('data', (chunk) => {
                resetTimeout();
                const text = chunk.toString();
                stderrBuffer += text;
                (0, Logger_1.log)('warn', `[Chat] stderr: ${text.substring(0, 200)}`);
            });
            proc.on('close', (code) => {
                clearTimeout(activityTimeout);
                this.activeClaudeProcesses.delete(processKey);
                releaseScope();
                // User-initiated stop: resolve with partial content + marker so the message becomes 'done'.
                if (this.userStoppedMessages.has(agentMessage.id)) {
                    this.userStoppedMessages.delete(agentMessage.id);
                    const stopNote = '_⏹ Vom Nutzer gestoppt_';
                    resolve(fullContent ? `${fullContent}\n\n${stopNote}` : stopNote);
                    return;
                }
                // Detect rate limit from stderr (only on non-zero exit, never check content to avoid false positives)
                if (code !== 0 && stderrBuffer) {
                    const rateLimitPattern = /rate[_\s-]?limit|429|too many requests|over[_\s-]?quota|resource[_\s-]?exhausted/i;
                    if (rateLimitPattern.test(stderrBuffer)) {
                        const retryMatch = stderrBuffer.match(/retry[_\s-]?after[:\s]*(\d+)/i) || stderrBuffer.match(/(\d+)\s*seconds?/i);
                        const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : 60000;
                        reject(new RateLimitError(`Rate limit erreicht`, retryAfterMs));
                        return;
                    }
                }
                if (code !== 0 && !fullContent) {
                    // If the failure looks like a resume problem (session not found / expired),
                    // drop the cached id so the next attempt cold-starts instead of looping.
                    if (resumeId && /session.*(not found|expired|invalid|unknown)|could not resume|no such session/i.test(stderrBuffer)) {
                        (0, Logger_1.log)('warn', `[Chat] Resume failed for ${scopeKey} (session ${resumeId}) — clearing cache`);
                        this.db.deleteClaudeSession(scopeKey);
                    }
                    reject(new Error(`Claude beendet mit Code ${code}`));
                    return;
                }
                // Persist session_id so the next prompt in this scope can --resume. A parallel cold run
                // (ownsScope === false) must not overwrite the owner's session id with its own throwaway.
                if (observedSessionId && ownsScope) {
                    try {
                        this.db.saveClaudeSession(scopeKey, observedSessionId, projectCwd || null, turnCount);
                    }
                    catch (err) {
                        (0, Logger_1.log)('warn', `[Chat] Failed to persist claude session for ${scopeKey}: ${err}`);
                    }
                }
                resolve(fullContent);
            });
            proc.on('error', (err) => {
                clearTimeout(activityTimeout);
                this.activeClaudeProcesses.delete(processKey);
                releaseScope();
                reject(new Error(`Claude konnte nicht gestartet werden: ${err.message}`));
            });
            // Write prompt to stdin and close immediately to signal EOF
            proc.stdin.end(prompt);
        });
    }
    // ── Retry ─────────────────────────────────────────────────────────────────
    async retryMessage(messageId) {
        // Find the failed message
        const message = this.db.getMessageById(messageId);
        if (!message || message.status !== 'error' || message.role !== 'agent') {
            (0, Logger_1.log)('warn', `[Chat] Cannot retry message ${messageId}: not found or not an error`);
            return;
        }
        const project = this.projects.get(message.projectId);
        if (!project)
            return;
        const agent = project.agents.find((a) => a.id === message.agentLocalId);
        if (!agent)
            return;
        // Find the original trigger message (what the user/agent sent that triggered this response)
        const triggerMessage = message.replyToLocalId
            ? this.db.getMessageById(message.replyToLocalId)
            : null;
        if (!triggerMessage) {
            (0, Logger_1.log)('warn', `[Chat] Cannot retry: trigger message not found for ${messageId}`);
            return;
        }
        // Delete the failed message
        this.db.deleteMessage(messageId);
        this.sendToRenderer(ipc_channels_1.IpcChannel.CHAT_MESSAGE_UPDATE, { ...message, _deleted: true });
        // Re-run the agent
        await this.runAgent(project, agent, triggerMessage, 0);
    }
    // ── Ticket Comment Mentions ─────────────────────────────────────────────
    async handleTicketCommentMention(projectId, ticketId, userComment) {
        const project = this.projects.get(projectId);
        if (!project)
            return;
        const ticket = this.db.getTicket(ticketId);
        if (!ticket)
            return;
        // Resolve mentioned agents
        const mentions = MentionParser_1.mentionParser.extractMentions(userComment);
        const mentionedAgents = MentionParser_1.mentionParser.resolveMentionsToAgents(mentions, project.agents);
        if (mentionedAgents.length === 0)
            return;
        for (const agent of mentionedAgents) {
            // Set agent to thinking
            agent.status = 'thinking';
            this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId, agentId: agent.id, status: 'thinking' });
            // Build a ticket-specific prompt
            const ticketsSummary = this.db.getTicketsSummaryForAgent(projectId);
            const existingComments = ticket.comments
                .map((c) => {
                const author = c.authorType === 'agent' ? (c.agentName ?? 'Agent') : 'User';
                return `${author}: ${c.content}`;
            })
                .join('\n');
            const prompt = [
                `[System]`,
                agent.systemPrompt,
                ``,
                `Du bist ${agent.name} und antwortest auf einen Kommentar in Ticket #${ticket.ticketNumber} "${ticket.title}".`,
                `Dein Mention-Key: ${agent.mentionKey}`,
                ticket.description ? `Ticket-Beschreibung: ${ticket.description}` : '',
                `Ticket-Status: ${ticket.status}`,
                ``,
                ticketsSummary ? `[Alle Tickets]\n${ticketsSummary}\n` : '',
                existingComments ? `[Bisherige Kommentare]\n${existingComments}\n` : '',
                `[Neuer Kommentar von User]`,
                userComment,
                ``,
                `Antworte kurz und präzise. Deine Antwort wird als Kommentar auf dem Ticket gespeichert.`,
                `Wenn du den Ticket-Status ändern willst, schreibe z.B. "#${ticket.ticketNumber} erledigt" oder "#${ticket.ticketNumber} gestartet".`,
            ].filter(Boolean).join('\n');
            try {
                agent.status = 'responding';
                this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId, agentId: agent.id, status: 'responding' });
                const response = await this.executeClaudePrompt(prompt, {
                    id: (0, crypto_1.randomUUID)(),
                    projectId,
                    role: 'agent',
                    agentLocalId: agent.id,
                    agentName: agent.name,
                    content: '',
                    mentions: [],
                    status: 'streaming',
                    clientTimestamp: new Date().toISOString(),
                }, (0, crypto_1.randomUUID)(), {
                    model: agent.model?.trim() || constants_1.DEFAULT_AGENT_MODEL,
                    effort: agent.effort?.trim() || constants_1.DEFAULT_AGENT_EFFORT,
                });
                // Save agent response as ticket comment
                if (response.trim()) {
                    const agentComment = {
                        id: (0, crypto_1.randomUUID)(),
                        ticketId,
                        projectId,
                        authorType: 'agent',
                        agentLocalId: agent.id,
                        agentName: agent.name,
                        content: response.trim(),
                        clientTimestamp: new Date().toISOString(),
                    };
                    this.db.saveComment(agentComment);
                    this.db.addToSyncQueue('ticket_comment', agentComment.id, 'create', agentComment);
                    this.sendToRenderer(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'comment-added', ticketId, comment: agentComment });
                    // Check for status changes in the response
                    this.processTicketReferences(project, agent, response);
                    (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} commented on ticket #${ticket.ticketNumber}`);
                }
            }
            catch (err) {
                (0, Logger_1.log)('error', `[Chat] Agent ${agent.name} failed to comment on ticket: ${err}`);
            }
            finally {
                agent.status = 'idle';
                this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, { projectId, agentId: agent.id, status: 'idle' });
            }
        }
    }
    // ── Ticket Creation from Agent Response ─────────────────────────────────
    processTicketCreation(project, agent, content, goalId) {
        const validCategories = ['bug', 'feature', 'task', 'improvement', 'documentation', 'question'];
        const created = [];
        // 1. Block format: [TICKET_CREATE: Title | Category]\n...description...\n[/TICKET_CREATE]
        const blockPattern = /\[TICKET_CREATE:\s*([^\]|]+?)(?:\s*\|\s*([^\]]*))?\]\s*\n([\s\S]*?)\[\/TICKET_CREATE\]/gi;
        let match;
        while ((match = blockPattern.exec(content)) !== null) {
            const title = match[1].trim();
            const rawCategory = match[2]?.trim().toLowerCase();
            const description = match[3]?.trim() || undefined;
            const category = rawCategory && validCategories.includes(rawCategory) ? rawCategory : undefined;
            if (!title)
                continue;
            const result = this.createTicketFromParsed(project, agent, title, description, category, goalId);
            if (result)
                created.push(result);
        }
        // 2. Inline format: [TICKET_CREATE: Title | Description | Category] (no closing tag)
        // Only match those NOT already matched by block format
        const inlinePattern = /\[TICKET_CREATE:\s*([^\]|]+?)(?:\s*\|\s*([^\]|]*))?(?:\s*\|\s*([^\]]*))?\]/gi;
        while ((match = inlinePattern.exec(content)) !== null) {
            // Skip if this position was part of a block match
            const fullMatch = match[0];
            const afterMatch = content.substring(match.index + fullMatch.length, match.index + fullMatch.length + 500);
            if (/\[\/TICKET_CREATE\]/i.test(afterMatch))
                continue;
            const title = match[1].trim();
            const field2 = match[2]?.trim();
            const field3 = match[3]?.trim();
            if (!title)
                continue;
            // If field2 is a category, treat it as category (no description)
            let description;
            let category;
            if (field2 && validCategories.includes(field2.toLowerCase())) {
                category = field2.toLowerCase();
                // field3 would be ignored in this case
            }
            else {
                description = field2 || undefined;
                const rawCat = field3?.toLowerCase();
                category = rawCat && validCategories.includes(rawCat) ? rawCat : undefined;
            }
            const result = this.createTicketFromParsed(project, agent, title, description, category, goalId);
            if (result)
                created.push(result);
        }
        return created;
    }
    createTicketFromParsed(project, agent, title, description, category, goalId) {
        // Deduplicate: within a goal, only check tickets belonging to that goal.
        // Outside a goal, check all project tickets.
        const existingTickets = goalId
            ? this.db.getTicketsByGoal(goalId)
            : this.db.getTicketsByProject(project.id);
        const normalizedTitle = title.toLowerCase().trim();
        const duplicate = existingTickets.find((t) => t.title.toLowerCase().trim() === normalizedTitle);
        if (duplicate) {
            (0, Logger_1.log)('info', `[Chat] Skipping duplicate ticket "${title}" (already exists as #${duplicate.ticketNumber})`);
            return null;
        }
        const ticketNumber = this.db.getNextTicketNumber(project.id);
        const now = new Date().toISOString();
        const ticket = {
            id: (0, crypto_1.randomUUID)(),
            projectId: project.id,
            title,
            description,
            status: 'open',
            category,
            ticketNumber,
            assignedAgentLocalId: undefined,
            assignedAgentName: undefined,
            sortOrder: 0,
            comments: [],
            createdAt: now,
            updatedAt: now,
        };
        this.db.saveTicket(ticket);
        this.db.addToSyncQueue('ticket', ticket.id, 'create', ticket);
        this.sendToRenderer(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'created', ticket });
        (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} created ticket #${ticketNumber}: ${title}`);
        return { title, ticketNumber };
    }
    replaceTicketCreateTags(content, createdTickets) {
        let idx = 0;
        // Replace block format first
        let result = content.replace(/\[TICKET_CREATE:\s*([^\]|]+?)(?:\s*\|\s*[^\]]*?)?\]\s*\n[\s\S]*?\[\/TICKET_CREATE\]/gi, () => {
            const ticket = createdTickets[idx++];
            return ticket ? `**Ticket #${ticket.ticketNumber}** erstellt: *${ticket.title}*` : '';
        });
        // Then replace inline format
        result = result.replace(/\[TICKET_CREATE:\s*([^\]|]+?)(?:\s*\|\s*[^\]]*)?\]/gi, () => {
            const ticket = createdTickets[idx++];
            return ticket ? `**Ticket #${ticket.ticketNumber}** erstellt: *${ticket.title}*` : '';
        });
        return result.trim();
    }
    // ── Ticket Reference Processing ──────────────────────────────────────────
    processTicketReferences(project, agent, content) {
        // Find all ticket number references: #1, Ticket #2, ticket-3, Ticket 4, etc.
        const ticketRefPattern = /(?:ticket[- ]?)?#(\d+)/gi;
        const referencedNumbers = new Set();
        let match;
        while ((match = ticketRefPattern.exec(content)) !== null) {
            referencedNumbers.add(parseInt(match[1], 10));
        }
        if (referencedNumbers.size === 0)
            return;
        (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} referenced tickets: ${[...referencedNumbers].join(', ')}`);
        for (const ticketNum of referencedNumbers) {
            const ticket = this.db.getTicketByNumber(project.id, ticketNum);
            if (!ticket)
                continue;
            // 1. Auto-create agent comment on the ticket
            const commentContent = this.extractRelevantSnippet(content, ticketNum);
            const comment = {
                id: (0, crypto_1.randomUUID)(),
                ticketId: ticket.id,
                projectId: project.id,
                authorType: 'agent',
                agentLocalId: agent.id,
                agentName: agent.name,
                content: commentContent,
                clientTimestamp: new Date().toISOString(),
            };
            this.db.saveComment(comment);
            this.db.addToSyncQueue('ticket_comment', comment.id, 'create', comment);
            this.sendToRenderer(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'comment-added', ticketId: ticket.id, comment });
            (0, Logger_1.log)('info', `[Chat] Auto-comment on ticket #${ticketNum} by ${agent.name}`);
            // 2. Check for status change signals
            const statusChange = this.detectStatusChange(content, ticketNum);
            if (statusChange && statusChange !== ticket.status) {
                this.db.updateTicket(ticket.id, { status: statusChange });
                this.db.addToSyncQueue('ticket', ticket.id, 'update', { id: ticket.id, status: statusChange });
                const updatedTicket = this.db.getTicket(ticket.id);
                this.sendToRenderer(ipc_channels_1.IpcChannel.TICKET_UPDATE, { type: 'updated', ticket: updatedTicket });
                (0, Logger_1.log)('info', `[Chat] Ticket #${ticketNum} status changed to '${statusChange}' by ${agent.name}`);
            }
        }
    }
    extractRelevantSnippet(content, ticketNum) {
        // Find sentences mentioning this ticket number and return them
        const sentences = content.split(/(?<=[.!?\n])\s+/);
        const relevant = sentences.filter((s) => {
            const pattern = new RegExp(`(?:ticket[- ]?)?#${ticketNum}\\b`, 'i');
            return pattern.test(s);
        });
        if (relevant.length > 0) {
            return relevant.join(' ').trim();
        }
        // Fallback: first 200 chars
        return content.length > 200 ? content.substring(0, 200) + '...' : content;
    }
    detectStatusChange(content, ticketNum) {
        // Build a regex that finds status keywords near the ticket reference
        // Look at sentences containing this ticket number
        const sentences = content.split(/(?<=[.!?\n])\s+/);
        const relevant = sentences.filter((s) => {
            const pattern = new RegExp(`(?:ticket[- ]?)?#${ticketNum}\\b`, 'i');
            return pattern.test(s);
        }).join(' ');
        if (!relevant)
            return null;
        // Check for done/completed
        if (/(?:erledigt|done|fertig|abgeschlossen|completed|gelöst|fixed)/i.test(relevant)) {
            return 'done';
        }
        // Check for in progress/started
        if (/(?:gestartet|start|in arbeit|in progress|arbeite|begonnen|working)/i.test(relevant)) {
            return 'in_progress';
        }
        return null;
    }
    // ── Document Save from Agent Response ─────────────────────────────────
    processDocumentSave(project, agent, content) {
        // Match [DOC_SAVE: Title]content[/DOC_SAVE]
        const docPattern = /\[DOC_SAVE:\s*([^\]]+?)\]([\s\S]*?)\[\/DOC_SAVE\]/gi;
        let match;
        const saved = [];
        while ((match = docPattern.exec(content)) !== null) {
            const title = match[1].trim();
            const docContent = match[2].trim();
            if (!title || !docContent)
                continue;
            // Check if document with this title already exists
            const existing = this.db.getDocumentByTitle(project.id, title);
            const now = new Date().toISOString();
            if (existing) {
                // Update existing document
                this.db.updateDocument(existing.id, {
                    content: docContent,
                    updatedByAgentId: agent.id,
                    updatedByAgentName: agent.name,
                });
                this.db.addToSyncQueue('document', existing.id, 'update', {
                    id: existing.id,
                    title,
                    content: docContent,
                });
                this.sendToRenderer(ipc_channels_1.IpcChannel.DOCUMENT_UPDATE, { type: 'updated', document: this.db.getDocument(existing.id) });
                saved.push({ title, isNew: false });
                (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} updated document: "${title}"`);
            }
            else {
                // Create new document
                const doc = {
                    id: (0, crypto_1.randomUUID)(),
                    projectId: project.id,
                    title,
                    content: docContent,
                    createdByAgentId: agent.id,
                    createdByAgentName: agent.name,
                    createdAt: now,
                    updatedAt: now,
                };
                this.db.saveDocument(doc);
                this.db.addToSyncQueue('document', doc.id, 'create', doc);
                this.sendToRenderer(ipc_channels_1.IpcChannel.DOCUMENT_UPDATE, { type: 'created', document: doc });
                saved.push({ title, isNew: true });
                (0, Logger_1.log)('info', `[Chat] Agent ${agent.name} created document: "${title}"`);
            }
        }
        return saved;
    }
    replaceDocSaveTags(content, savedDocs) {
        let idx = 0;
        return content.replace(/\[DOC_SAVE:\s*([^\]]+?)\][\s\S]*?\[\/DOC_SAVE\]/gi, () => {
            const doc = savedDocs[idx++];
            if (doc) {
                return `**${doc.isNew ? 'Dokument erstellt' : 'Dokument aktualisiert'}:** *${doc.title}*`;
            }
            return '';
        }).trim();
    }
    // ── User Question Detection ──────────────────────────────────────────────
    detectsUserQuestion(content) {
        // Check if the agent's response contains a direct question to the user.
        // We look at the last ~500 chars (the conclusion of the response) for question patterns.
        const tail = content.slice(-500);
        // Direct question markers in German and English
        const questionPatterns = [
            /\?\s*$/m, // Ends a paragraph with ?
            /(?:was meinst|was denkst|was hältst) du/i, // "was meinst/denkst/hältst du"
            /(?:kannst|könntest|würdest|möchtest|willst) du/i, // "kannst/könntest du..."
            /(?:soll ich|darf ich|kann ich)/i, // "soll ich..."
            /(?:what do you think|what would you|could you|would you|do you want|shall I|should I)/i,
            /(?:bitte (?:bestätige|entscheide|wähle|sag))/i, // "bitte bestätige/entscheide..."
            /(?:welche[rns]?\s+(?:option|variante|ansatz|weg))/i, // "welche Option..."
        ];
        return questionPatterns.some((p) => p.test(tail));
    }
    detectsCompletionMessage(content) {
        // Detect if the agent's response is primarily a completion/confirmation/handoff message
        // that shouldn't trigger further agent chains (prevents ping-pong chatter).
        const trimmed = content.trim();
        const hasMention = /@[a-zA-Z0-9_-]+/.test(trimmed);
        // First check: does the message contain a real task/action request for another agent?
        // If so, NEVER block it — this is a legitimate delegation.
        if (hasMention) {
            const taskPatterns = [
                /(?:bitte|please).*(?:mach|erstell|implementier|analysier|prüf|check|review|build|create|fix|update|schreib|teste|deploy|kümmere|bearbeite|übernimm)/i,
                /(?:kannst du|könntest du|would you|could you|can you)/i,
                /@\w+[,:]?\s+(?:mach|erstell|implementier|analysier|prüf|check|review|build|create|fix|update|schreib|teste|deploy|kümmere|bearbeite|übernimm)/i,
                /@\w+[,:]?\s+(?:bitte|please)/i,
                /@\w+[,:]?\s+(?:arbeite|starte|beginne|setze.*um|führe.*aus|kümmere dich)/i,
                /(?:ticket|aufgabe|task|issue)\s*#?\d*/i,
                /(?:du sollst|du musst|deine aufgabe|your task)/i,
            ];
            if (taskPatterns.some((p) => p.test(trimmed)))
                return false;
        }
        // Short messages that are just status updates / confirmations
        if (trimmed.length < 300) {
            const completionPatterns = [
                /(?:ist|wurde|habe ich|haben wir|wurde).*(?:erledigt|fertig|abgeschlossen|umgesetzt|implementiert|erstellt|gemacht)/i,
                /(?:alles|aufgabe|arbeit).*(?:erledigt|fertig|abgeschlossen|done|complete)/i,
                /(?:kannst|können).*(?:weiter|fortfahren|übernehmen|starten|anfangen)/i,
                /(?:übergebe|übergabe|hand off|weiter(?:leiten|geben|reichen))/i,
                /(?:ich bin fertig|task complete|done|abgeschlossen)/i,
                /(?:danke|vielen dank|thanks).*@/i,
                /(?:gut gemacht|super|perfekt|toll|great|nice).*@/i,
                /(?:noted|verstanden|alles klar|ok|okay|roger)/i,
            ];
            if (completionPatterns.some((p) => p.test(trimmed)))
                return true;
        }
        // Very short acknowledgment with mention but no real task
        if (trimmed.length < 150 && hasMention) {
            const lines = trimmed.split('\n').filter((l) => l.trim());
            if (lines.length <= 2)
                return true;
        }
        return false;
    }
    // ── Helpers ────────────────────────────────────────────────────────────────
    showAgentDoneNotification(agent, content) {
        if (!this.mainWindow || this.mainWindow.isFocused())
            return;
        if (!electron_1.Notification.isSupported())
            return;
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        const notification = new electron_1.Notification({
            title: `${agent.name} ist fertig`,
            body: preview || 'Antwort erhalten.',
            silent: false,
        });
        notification.on('click', () => {
            this.mainWindow?.show();
            this.mainWindow?.focus();
        });
        notification.show();
    }
    sendToRenderer(channel, data) {
        this.mainWindow?.webContents.send(channel, data);
    }
    stopAgentSession(sessionId) {
        const session = this.activeAgentSessions.get(sessionId);
        if (session) {
            this.activeAgentSessions.delete(sessionId);
            (0, Logger_1.log)('info', `Stopped agent session ${sessionId}`);
        }
    }
    /** Kill the running Claude process for a specific agent message (chat stop button). */
    stopMessageGeneration(messageId) {
        let killed = false;
        for (const [key, entry] of this.activeClaudeProcesses) {
            if (key === messageId || key.startsWith(`${messageId}:`)) {
                (0, Logger_1.log)('info', `[Chat] User stopped Claude process for message ${messageId}`);
                this.userStoppedMessages.add(messageId);
                try {
                    entry.proc.kill('SIGKILL');
                }
                catch { /* already dead */ }
                this.activeClaudeProcesses.delete(key);
                killed = true;
            }
        }
        return killed;
    }
    /**
     * Per-agent kill switch. Stopping kills whatever that agent is running right now AND sets a
     * persisted flag so no new run is dispatched to it — neither from chat nor from the autonomous
     * goal loop — until it is resumed. Other agents keep working untouched.
     */
    setAgentStopped(projectId, agentId, stopped) {
        this.db.setAgentStopped(agentId, stopped);
        const project = this.projects.get(projectId);
        const agent = project?.agents.find((a) => a.id === agentId);
        if (agent) {
            agent.stopped = stopped;
            if (stopped) {
                agent.status = 'idle';
                agent.currentTool = undefined;
            }
        }
        let killed = 0;
        if (stopped) {
            for (const [key, entry] of this.activeClaudeProcesses) {
                if (entry.agentLocalId !== agentId)
                    continue;
                // Mark the message as user-stopped so the close handler finalises it as 'done'
                // with the partial content instead of surfacing a crash.
                this.userStoppedMessages.add(entry.messageId);
                (0, Logger_1.log)('info', `[Chat] Stop switch: killing Claude process ${key} (agent ${agent?.name ?? agentId})`);
                try {
                    entry.proc.kill('SIGKILL');
                }
                catch { /* already dead */ }
                this.activeClaudeProcesses.delete(key);
                killed++;
            }
        }
        (0, Logger_1.log)('info', `[Chat] Agent ${agent?.name ?? agentId} ${stopped ? 'gestoppt' : 'fortgesetzt'} (${killed} Prozess(e) beendet)`);
        this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, {
            projectId,
            agentId,
            status: 'idle',
            currentTool: undefined,
            stopped,
        });
        return { killed };
    }
    isAgentStopped(projectId, agentId) {
        const agent = this.projects.get(projectId)?.agents.find((a) => a.id === agentId);
        if (agent?.stopped !== undefined)
            return agent.stopped;
        return this.db.isAgentStopped(agentId);
    }
    /** Kill all running Claude processes and reset agent states (used when cancelling a goal) */
    killAllActiveProcesses() {
        this.killProcessesByFilter(() => true);
    }
    /** Kill only Claude processes whose key contains the given goalId tag */
    killProcessesForGoal(goalId) {
        const tag = `goal:${goalId}`;
        this.killProcessesByFilter((key) => key.includes(tag));
    }
    killProcessesByFilter(predicate) {
        const killedProjectIds = new Set();
        for (const [key, entry] of this.activeClaudeProcesses) {
            if (!predicate(key))
                continue;
            (0, Logger_1.log)('info', `[Chat] Killing Claude process ${key}`);
            try {
                entry.proc.kill('SIGKILL');
            }
            catch { /* already dead */ }
            this.activeClaudeProcesses.delete(key);
            this.activeAgentSessions.delete(key);
        }
        // Reset agent statuses to idle for affected agents
        for (const project of this.projects.values()) {
            for (const agent of project.agents) {
                if (agent.status !== 'idle') {
                    agent.status = 'idle';
                    agent.currentTool = undefined;
                    this.sendToRenderer(ipc_channels_1.IpcChannel.AGENT_STATUS_UPDATE, {
                        projectId: project.id,
                        agentId: agent.id,
                        status: 'idle',
                    });
                }
            }
        }
    }
}
exports.ChatOrchestrator = ChatOrchestrator;
//# sourceMappingURL=ChatOrchestrator.js.map
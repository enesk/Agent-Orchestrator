"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const events_1 = require("events");
const https_1 = __importDefault(require("https"));
const axios_1 = __importDefault(require("axios"));
const Logger_1 = require("./Logger");
class SyncService extends events_1.EventEmitter {
    constructor(db) {
        super();
        this.backendUrl = '';
        this.token = '';
        this.syncInterval = null;
        this.connectivityInterval = null;
        this._isSyncing = false;
        this._isOnline = false;
        this._lastSyncAt = null;
        this.db = db;
    }
    get isOnline() { return this._isOnline; }
    get isSyncing() { return this._isSyncing; }
    get lastSyncAt() { return this._lastSyncAt; }
    initialize(backendUrl, token) {
        // Extract host:port from the backend URL (strip protocol, path like /ws, /app/*)
        let host = backendUrl
            .replace(/^wss?:\/\//, '')
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, ''); // remove any path (e.g. /ws, /app/key)
        this.backendUrl = `https://${host}`;
        this.token = token;
        this.api = axios_1.default.create({
            baseURL: `${this.backendUrl}/api/v1`,
            timeout: 10000,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            httpsAgent: new https_1.default.Agent({ rejectUnauthorized: false }),
        });
        (0, Logger_1.log)('info', `SyncService initialized: ${this.backendUrl}`);
        // Cleanup old messages
        const deleted = this.db.deleteOldMessages(90);
        if (deleted > 0) {
            (0, Logger_1.log)('info', `Cleaned up ${deleted} old synced messages`);
        }
        // Start connectivity check every 10 seconds
        this.connectivityInterval = setInterval(() => this.checkConnectivity(), 10000);
        // Start sync loop every 30 seconds
        this.syncInterval = setInterval(() => this.processSyncQueue(), 30000);
        // Initial check after 3 seconds
        setTimeout(() => this.checkConnectivity(), 3000);
    }
    async checkConnectivity() {
        const wasOnline = this._isOnline;
        try {
            await this.api.get('/ping', { timeout: 3000 });
            this._isOnline = true;
        }
        catch (err) {
            this._isOnline = false;
            (0, Logger_1.log)('warn', `[Sync] Ping failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (wasOnline !== this._isOnline) {
            (0, Logger_1.log)('info', `Connectivity changed: ${this._isOnline ? 'online' : 'offline'}`);
            this.emit('connectivity-changed', this._isOnline);
            if (this._isOnline) {
                // Came online, sync immediately
                this.processSyncQueue();
            }
        }
    }
    async processSyncQueue() {
        if (this._isSyncing || !this._isOnline)
            return;
        this._isSyncing = true;
        let synced = 0;
        let failed = 0;
        try {
            const items = this.db.getPendingSyncItems(50);
            if (items.length > 0) {
                (0, Logger_1.log)('info', `[Sync] Processing ${items.length} pending items`);
            }
            for (const item of items) {
                if (item.attempts >= 5)
                    continue;
                try {
                    (0, Logger_1.log)('info', `[Sync] Syncing ${item.entityType}/${item.action} (id: ${item.entityId})`);
                    await this.executeSyncItem(item.entityType, item.action, item.payload);
                    this.db.removeSyncQueueItem(item.id);
                    // Mark entity as synced
                    if (item.entityType === 'message') {
                        this.db.markMessageSynced(item.entityId);
                    }
                    else if (item.entityType === 'project') {
                        // The remote ID comes from the API response
                    }
                    else if (item.entityType === 'agent') {
                        this.db.markAgentSynced(item.entityId);
                    }
                    else if (item.entityType === 'ticket') {
                        this.db.markTicketSynced(item.entityId);
                    }
                    else if (item.entityType === 'ticket_comment') {
                        this.db.markCommentSynced(item.entityId);
                    }
                    else if (item.entityType === 'document') {
                        this.db.markDocumentSynced(item.entityId);
                    }
                    synced++;
                }
                catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    (0, Logger_1.log)('warn', `[Sync] Failed ${item.entityType}/${item.action}: ${errorMsg}`);
                    this.db.incrementSyncAttempts(item.id, errorMsg);
                    failed++;
                }
            }
            if (synced > 0 || failed > 0) {
                this._lastSyncAt = new Date();
                this.emit('sync-completed', {
                    synced,
                    failed,
                    timestamp: this._lastSyncAt.toISOString(),
                });
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            (0, Logger_1.log)('error', `Sync queue processing error: ${errorMsg}`);
            this.emit('sync-error', errorMsg);
        }
        finally {
            this._isSyncing = false;
        }
    }
    async executeSyncItem(entityType, action, payload) {
        switch (entityType) {
            case 'project': {
                if (action === 'create') {
                    const res = await this.api.post('/chat-projects', {
                        local_id: payload.id,
                        name: payload.name,
                        description: payload.description,
                        metadata: payload.metadata,
                    });
                    if (res.data.project?.id) {
                        this.db.markProjectSynced(payload.id, res.data.project.id);
                    }
                }
                else if (action === 'update') {
                    const project = this.db.getProject(payload.id);
                    if (project?.remoteId) {
                        await this.api.put(`/chat-projects/${project.remoteId}`, {
                            name: payload.name,
                            description: payload.description,
                            metadata: payload.metadata,
                        });
                    }
                }
                else if (action === 'delete') {
                    const project = this.db.getProject(payload.id);
                    if (project?.remoteId) {
                        await this.api.delete(`/chat-projects/${project.remoteId}`);
                    }
                }
                break;
            }
            case 'agent': {
                if (action === 'create') {
                    const project = this.db.getProject(payload.projectId);
                    if (project?.remoteId) {
                        await this.api.post(`/chat-projects/${project.remoteId}/agents`, {
                            local_id: payload.id,
                            name: payload.name,
                            title: payload.title,
                            mention_key: payload.mentionKey,
                            system_prompt: payload.systemPrompt,
                            color: payload.color,
                            avatar: payload.avatar,
                            sort_order: payload.sortOrder,
                        });
                    }
                }
                else if (action === 'delete') {
                    const project = this.db.getProject(payload.projectId);
                    if (project?.remoteId) {
                        await this.api.delete(`/chat-projects/${project.remoteId}/agents/${payload.id}`);
                    }
                }
                break;
            }
            case 'message': {
                if (action === 'create') {
                    const project = this.db.getProject(payload.projectId);
                    if (project?.remoteId) {
                        await this.api.post(`/chat-projects/${project.remoteId}/messages`, {
                            local_id: payload.id,
                            role: payload.role,
                            content: payload.content,
                            agent_local_id: payload.agentLocalId,
                            agent_name: payload.agentName,
                            mentions: payload.mentions,
                            reply_to_local_id: payload.replyToLocalId,
                            session_id: payload.sessionId,
                            status: payload.status === 'sending' || payload.status === 'streaming' ? 'done' : payload.status,
                            attachments: payload.attachments ?? null,
                            client_timestamp: payload.clientTimestamp,
                        });
                    }
                }
                break;
            }
            case 'ticket': {
                const project = this.db.getProject(payload.projectId);
                if (!project?.remoteId)
                    break;
                if (action === 'create') {
                    await this.api.post(`/chat-projects/${project.remoteId}/tickets`, {
                        local_id: payload.id,
                        title: payload.title,
                        description: payload.description,
                        status: payload.status,
                        assigned_agent_local_id: payload.assignedAgentLocalId,
                        assigned_agent_name: payload.assignedAgentName,
                        sort_order: payload.sortOrder,
                    });
                }
                else if (action === 'update') {
                    // Find remote ticket by local_id
                    const ticketId = payload.id;
                    const ticket = this.db.getTicket(ticketId);
                    if (ticket) {
                        await this.api.put(`/chat-projects/${project.remoteId}/tickets/${ticketId}`, {
                            title: payload.title,
                            description: payload.description,
                            status: payload.status,
                            assigned_agent_local_id: payload.assignedAgentLocalId,
                            assigned_agent_name: payload.assignedAgentName,
                            sort_order: payload.sortOrder,
                        });
                    }
                }
                else if (action === 'delete') {
                    await this.api.delete(`/chat-projects/${project.remoteId}/tickets/${payload.id}`);
                }
                break;
            }
            case 'ticket_comment': {
                const project = this.db.getProject(payload.projectId);
                if (!project?.remoteId)
                    break;
                if (action === 'create') {
                    await this.api.post(`/chat-projects/${project.remoteId}/tickets/${payload.ticketId}/comments`, {
                        local_id: payload.id,
                        author_type: payload.authorType,
                        agent_local_id: payload.agentLocalId,
                        agent_name: payload.agentName,
                        content: payload.content,
                        client_timestamp: payload.clientTimestamp,
                    });
                }
                break;
            }
            case 'document': {
                const project = this.db.getProject(payload.projectId);
                if (!project?.remoteId)
                    break;
                if (action === 'create') {
                    await this.api.post(`/chat-projects/${project.remoteId}/documents`, {
                        local_id: payload.id,
                        title: payload.title,
                        content: payload.content,
                        created_by_agent_id: payload.createdByAgentId,
                        created_by_agent_name: payload.createdByAgentName,
                    });
                }
                else if (action === 'update') {
                    await this.api.put(`/chat-projects/${project.remoteId}/documents/${payload.id}`, {
                        title: payload.title,
                        content: payload.content,
                        updated_by_agent_id: payload.updatedByAgentId,
                        updated_by_agent_name: payload.updatedByAgentName,
                    });
                }
                else if (action === 'delete') {
                    await this.api.delete(`/chat-projects/${project.remoteId}/documents/${payload.id}`);
                }
                break;
            }
        }
    }
    async fetchRemoteMessages(projectId, since) {
        const project = this.db.getProject(projectId);
        if (!project?.remoteId || !this._isOnline)
            return [];
        try {
            const params = { limit: '500' };
            if (since)
                params.since = since;
            const res = await this.api.get(`/chat-projects/${project.remoteId}/messages`, { params });
            const remoteMessages = res.data.messages;
            const newMessages = [];
            for (const rm of remoteMessages) {
                // Check if we already have this message locally
                const existing = this.db.getMessageById(rm.local_id);
                if (!existing) {
                    const msg = {
                        id: rm.local_id,
                        projectId,
                        role: rm.role,
                        agentLocalId: rm.agent_local_id,
                        agentName: rm.agent_name,
                        content: rm.content,
                        mentions: rm.mentions ?? [],
                        replyToLocalId: rm.reply_to_local_id,
                        sessionId: rm.session_id,
                        status: rm.status,
                        clientTimestamp: rm.client_timestamp,
                        synced: true,
                    };
                    this.db.saveMessage(msg);
                    newMessages.push(msg);
                }
            }
            return newMessages;
        }
        catch (err) {
            (0, Logger_1.log)('error', `Failed to fetch remote messages: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }
    async fetchRemoteTickets(projectId) {
        const project = this.db.getProject(projectId);
        if (!project?.remoteId || !this._isOnline)
            return [];
        try {
            const res = await this.api.get(`/chat-projects/${project.remoteId}/tickets`);
            const raw = res.data.tickets ?? res.data;
            const remoteTickets = (Array.isArray(raw) ? raw : []);
            const newTickets = [];
            for (const rt of remoteTickets) {
                const existing = this.db.getTicket(rt.local_id);
                if (!existing) {
                    const ticket = {
                        id: rt.local_id,
                        projectId,
                        ticketNumber: rt.ticket_number,
                        title: rt.title,
                        description: rt.description,
                        status: rt.status,
                        category: rt.category,
                        assignedAgentLocalId: rt.assigned_agent_local_id,
                        assignedAgentName: rt.assigned_agent_name,
                        sortOrder: rt.sort_order ?? 0,
                        createdAt: rt.created_at,
                        updatedAt: rt.updated_at,
                        synced: true,
                        comments: [],
                    };
                    this.db.saveTicket(ticket);
                    newTickets.push(ticket);
                    // Sync comments for this ticket
                    const comments = rt.comments ?? [];
                    for (const rc of comments) {
                        const comment = {
                            id: rc.local_id,
                            ticketId: ticket.id,
                            projectId,
                            authorType: rc.author_type,
                            agentLocalId: rc.agent_local_id,
                            agentName: rc.agent_name,
                            content: rc.content,
                            clientTimestamp: rc.client_timestamp,
                            synced: true,
                        };
                        this.db.saveComment(comment);
                    }
                }
            }
            return newTickets;
        }
        catch (err) {
            (0, Logger_1.log)('error', `Failed to fetch remote tickets: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }
    async fullSync() {
        if (!this._isOnline) {
            this.emit('sync-error', 'Cannot sync while offline');
            return;
        }
        (0, Logger_1.log)('info', 'Starting full sync...');
        try {
            // 1. Fetch all projects from server
            const res = await this.api.get('/chat-projects');
            const remoteProjects = res.data.projects;
            for (const rp of remoteProjects) {
                const localProject = this.db.getProject(rp.local_id);
                if (!localProject) {
                    // New project from remote
                    const project = {
                        id: rp.local_id,
                        name: rp.name,
                        description: rp.description,
                        metadata: rp.metadata,
                        createdAt: rp.created_at,
                        updatedAt: rp.updated_at,
                        agents: [],
                        synced: true,
                        remoteId: rp.id,
                    };
                    this.db.saveProject(project);
                }
                else {
                    // Existing project - update remote_id and restore any missing data from backend
                    if (!localProject.remoteId) {
                        this.db.markProjectSynced(localProject.id, rp.id);
                    }
                    // Restore metadata from backend if locally missing
                    const remoteMetadata = rp.metadata;
                    if (remoteMetadata && Object.keys(remoteMetadata).length > 0 && (!localProject.metadata || Object.keys(localProject.metadata).length === 0)) {
                        const restored = {
                            ...localProject,
                            metadata: remoteMetadata,
                            updatedAt: localProject.updatedAt,
                            synced: true,
                            remoteId: localProject.remoteId ?? rp.id,
                        };
                        this.db.saveProject(restored);
                    }
                }
                // Always sync agents from remote (re-creates any that were lost).
                // The backend payload carries no `model` / `global_agent_id`, so anything it does not
                // know about MUST be carried over from the local row — otherwise this full sync (which
                // runs on every startup) would overwrite the user's per-agent model with NULL and every
                // agent would silently fall back to DEFAULT_AGENT_MODEL.
                const projectId = rp.local_id;
                const agents = rp.agents ?? [];
                const localAgents = this.db.getAgentsByProject(projectId);
                for (const ra of agents) {
                    const localId = ra.local_id;
                    const localAgent = localAgents.find((a) => a.id === localId);
                    const remoteModel = ra.model?.trim();
                    const agent = {
                        id: localId,
                        projectId,
                        globalAgentId: localAgent?.globalAgentId,
                        name: ra.name,
                        title: ra.title ?? localAgent?.title,
                        mentionKey: ra.mention_key,
                        systemPrompt: ra.system_prompt,
                        color: ra.color,
                        avatar: ra.avatar ?? localAgent?.avatar,
                        // Local model wins — it is configured in this app and not (yet) synced to the backend.
                        model: localAgent?.model ?? remoteModel,
                        // The backend has no notion of effort at all, so the local value is the only source.
                        effort: localAgent?.effort,
                        sortOrder: ra.sort_order ?? 0,
                        status: 'idle',
                        stopped: localAgent?.stopped,
                    };
                    this.db.saveAgent(projectId, agent);
                }
            }
            // 2. Fetch messages and tickets for each project (last 30 days)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
            const allProjects = this.db.getAllProjects();
            for (const project of allProjects) {
                await this.fetchRemoteMessages(project.id, thirtyDaysAgo);
                await this.fetchRemoteTickets(project.id);
            }
            // 3. Process pending sync queue
            await this.processSyncQueue();
            // 4. Clean up permanently failed items (5+ attempts)
            const cleared = this.db.clearFailedSyncItems();
            if (cleared > 0) {
                (0, Logger_1.log)('info', `[Sync] Cleared ${cleared} permanently failed sync items`);
            }
            this._lastSyncAt = new Date();
            (0, Logger_1.log)('info', 'Full sync completed');
            this.emit('full-sync-completed');
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            (0, Logger_1.log)('error', `Full sync failed: ${errorMsg}`);
            this.emit('sync-error', errorMsg);
        }
    }
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        if (this.connectivityInterval) {
            clearInterval(this.connectivityInterval);
            this.connectivityInterval = null;
        }
        (0, Logger_1.log)('info', 'SyncService stopped');
    }
}
exports.SyncService = SyncService;
//# sourceMappingURL=SyncService.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backendConnection = exports.BackendConnection = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const https_1 = __importDefault(require("https"));
const zod_1 = require("zod");
const Logger_1 = require("./Logger");
const MAX_QUEUE_SIZE = 50;
// ── Zod validation schema ───────────────────────────────────────────────────
const AgentConfigSchema = zod_1.z.object({
    systemPrompt: zod_1.z.string().optional(),
    maxTokens: zod_1.z.number().optional(),
    tools: zod_1.z.array(zod_1.z.string()).optional(),
    workingDirectory: zod_1.z.string().optional(),
    timeout: zod_1.z.number().optional(),
});
const IncomingMessageSchema = zod_1.z.object({
    type: zod_1.z.enum(['run_agent', 'stop_agent', 'ping', 'config_update']),
    agentId: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    config: AgentConfigSchema.optional(),
});
// ── Class ───────────────────────────────────────────────────────────────────
class BackendConnection extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.ws = null;
        this.token = null;
        this.backendUrl = null;
        this.status = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.heartbeatInterval = 30000;
        this.messageQueue = [];
        this.manualDisconnect = false;
        // Callback to fetch current state – set by Orchestrator
        this.getOrchestratorState = null;
    }
    // ── Public API ──────────────────────────────────────────────────────────
    async connect(backendUrl, token) {
        this.backendUrl = backendUrl;
        this.token = token;
        this.manualDisconnect = false;
        this.setStatus('connecting');
        // Validate token against backend API before connecting WebSocket
        const host = this.stripProtocol(backendUrl).replace(/\/+$/, '');
        const isLocal = host.includes('localhost') || host.includes('.test') || host.includes('127.0.0.1');
        try {
            await this.validateToken(host, token, isLocal);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            (0, Logger_1.log)('error', `Token validation failed: ${msg}`);
            this.setStatus('error');
            this.emit('error', `Authentication failed: ${msg}`);
            this.setStatus('disconnected');
            this.emit('disconnected');
            return;
        }
        // Build Reverb-compatible WebSocket URL
        const protocol = isLocal ? 'ws' : 'wss';
        const port = isLocal ? ':8080' : '';
        const appKey = 'orchestrator-key';
        const url = `${protocol}://${host}${port}/app/${appKey}?token=${encodeURIComponent(token)}`;
        this.doConnect(url);
    }
    validateToken(host, token, _isLocal) {
        return new Promise((resolve, reject) => {
            const apiUrl = `https://${host}/api/v1/plan/limits`;
            const req = https_1.default.get(apiUrl, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                rejectUnauthorized: false,
            }, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                }
                else if (res.statusCode === 401) {
                    reject(new Error('Invalid token'));
                }
                else {
                    reject(new Error(`Unexpected response: ${res.statusCode}`));
                }
                res.resume();
            });
            req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)));
            req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')); });
        });
    }
    disconnect() {
        this.manualDisconnect = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        this.setStatus('disconnected');
        (0, Logger_1.log)('info', 'Manually disconnected from backend');
        this.emit('disconnected');
    }
    send(message) {
        if (this.status === 'connected' && this.ws && this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
        else {
            // Queue message for when we reconnect
            if (this.messageQueue.length < MAX_QUEUE_SIZE) {
                this.messageQueue.push(message);
                (0, Logger_1.log)('debug', `Message queued (${this.messageQueue.length}/${MAX_QUEUE_SIZE}): ${message.type}`);
            }
            else {
                (0, Logger_1.log)('warn', 'Message queue full, dropping message');
            }
        }
    }
    getStatus() {
        return this.status;
    }
    get connected() {
        return this.status === 'connected';
    }
    destroy() {
        this.disconnect();
        this.messageQueue = [];
        this.removeAllListeners();
    }
    // ── Private: Connection ─────────────────────────────────────────────────
    doConnect(url) {
        // Clean up any existing connection
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        (0, Logger_1.log)('info', `Connecting to backend: ${url.replace(/token=[^&]+/, 'token=***')}`);
        try {
            this.ws = new ws_1.default(url, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
                rejectUnauthorized: false,
            });
        }
        catch (err) {
            const msg = `Failed to create WebSocket: ${err.message}`;
            (0, Logger_1.log)('error', msg);
            this.setStatus('error');
            this.emit('error', msg);
            return;
        }
        // ── open ──────────────────────────────────────────────────────────
        this.ws.on('open', () => {
            this.setStatus('connected');
            this.reconnectAttempts = 0;
            (0, Logger_1.log)('info', 'Connected to backend');
            this.startHeartbeat();
            this.flushMessageQueue();
            // Send initial connected message with current state
            const state = this.getOrchestratorState?.() ?? null;
            const connectedMsg = {
                type: 'connected',
                state: state ?? undefined,
                timestamp: Date.now(),
            };
            this.ws.send(JSON.stringify(connectedMsg));
            this.emit('connected');
        });
        // ── message ───────────────────────────────────────────────────────
        this.ws.on('message', (raw) => {
            let parsed;
            try {
                parsed = JSON.parse(raw.toString());
            }
            catch (err) {
                (0, Logger_1.log)('error', `Failed to parse backend message: ${err.message}`);
                return;
            }
            // Reverb speaks the Pusher protocol – those frames carry `event`, not `type`
            const frame = parsed;
            if (typeof frame?.event === 'string') {
                this.handlePusherFrame(frame);
                return;
            }
            const result = IncomingMessageSchema.safeParse(parsed);
            if (!result.success) {
                (0, Logger_1.log)('debug', `Ignoring unrecognized backend message (type=${frame?.type ?? 'undefined'})`);
                return;
            }
            const message = result.data;
            // Respond to ping immediately
            if (message.type === 'ping') {
                (0, Logger_1.log)('debug', 'Received ping, sending pong');
                const pong = {
                    type: 'pong',
                    timestamp: Date.now(),
                };
                this.ws?.send(JSON.stringify(pong));
                return;
            }
            this.emit('message', message);
        });
        // ── close ─────────────────────────────────────────────────────────
        this.ws.on('close', (code, reason) => {
            this.stopHeartbeat();
            this.setStatus('disconnected');
            (0, Logger_1.log)('info', `Backend connection closed (code: ${code}, reason: ${reason.toString() || 'none'})`);
            this.emit('disconnected');
            if (!this.manualDisconnect) {
                this.reconnect();
            }
        });
        // ── error ─────────────────────────────────────────────────────────
        this.ws.on('error', (err) => {
            const msg = `WebSocket error: ${err.message}`;
            (0, Logger_1.log)('error', msg);
            this.setStatus('error');
            this.emit('error', msg);
        });
    }
    // ── Private: Pusher/Reverb protocol ─────────────────────────────────────
    handlePusherFrame(frame) {
        const event = frame.event;
        const data = this.parseFrameData(frame.data);
        switch (event) {
            case 'pusher:connection_established':
                (0, Logger_1.log)('debug', `Reverb connection established (socket ${data?.socket_id ?? 'unknown'})`);
                return;
            case 'pusher:ping':
                this.ws?.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
                (0, Logger_1.log)('debug', 'Reverb ping received, sent pong');
                return;
            case 'pusher:pong':
                (0, Logger_1.log)('debug', 'Reverb pong received');
                return;
            case 'pusher:error':
                (0, Logger_1.log)('debug', `Reverb error (code ${data?.code ?? '?'}): ${data?.message ?? 'unknown'}`);
                return;
            case 'pusher_internal:subscription_succeeded':
                (0, Logger_1.log)('debug', `Subscribed to channel ${frame.channel ?? '?'}`);
                return;
        }
        // Application broadcast (e.g. run_agent on private-user.{id}) – payload sits in `data`
        const result = IncomingMessageSchema.safeParse(data);
        if (!result.success) {
            (0, Logger_1.log)('debug', `Ignoring unrecognized backend event "${event}"`);
            return;
        }
        this.emit('message', result.data);
    }
    parseFrameData(data) {
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            }
            catch {
                return null;
            }
        }
        return data ?? null;
    }
    // ── Private: Reconnect ──────────────────────────────────────────────────
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            const msg = `Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`;
            (0, Logger_1.log)('error', msg);
            this.emit('max-reconnect-reached');
            return;
        }
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        (0, Logger_1.log)('info', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            if (this.backendUrl && this.token) {
                const url = `wss://${this.stripProtocol(this.backendUrl)}/app/orchestrator?token=${encodeURIComponent(this.token)}`;
                this.setStatus('connecting');
                this.doConnect(url);
            }
        }, delay);
    }
    // ── Private: Heartbeat ──────────────────────────────────────────────────
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
                (0, Logger_1.log)('warn', 'Heartbeat detected dead connection, triggering reconnect');
                this.stopHeartbeat();
                if (this.ws) {
                    this.ws.removeAllListeners();
                    this.ws.close();
                    this.ws = null;
                }
                this.setStatus('disconnected');
                this.emit('disconnected');
                if (!this.manualDisconnect) {
                    this.reconnect();
                }
                return;
            }
            // Reverb only accepts Pusher-protocol frames – a `{type:'pong'}` frame
            // is answered with a pusher:error on every beat
            this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
            (0, Logger_1.log)('debug', 'Heartbeat sent');
        }, this.heartbeatInterval);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    // ── Private: Helpers ────────────────────────────────────────────────────
    flushMessageQueue() {
        if (this.messageQueue.length === 0)
            return;
        (0, Logger_1.log)('info', `Flushing ${this.messageQueue.length} queued message(s)`);
        const queued = [...this.messageQueue];
        this.messageQueue = [];
        for (const msg of queued) {
            if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                this.ws.send(JSON.stringify(msg));
            }
            else {
                // Connection lost again mid-flush, re-queue remaining
                this.messageQueue.push(msg);
            }
        }
    }
    setStatus(newStatus) {
        if (this.status !== newStatus) {
            this.status = newStatus;
            this.emit('status-change', newStatus);
        }
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    stripProtocol(url) {
        return url.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
    }
}
exports.BackendConnection = BackendConnection;
// ── Singleton export ────────────────────────────────────────────────────────
exports.backendConnection = new BackendConnection();
//# sourceMappingURL=BackendConnection.js.map
import WebSocket from 'ws'
import { EventEmitter } from 'events'
import https from 'https'
import http from 'http'
import { z } from 'zod'
import { IncomingMessage, OutgoingMessage, OrchestratorState } from '@shared/types'
import { log } from './Logger'

// ── Types ───────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

const MAX_QUEUE_SIZE = 50

// ── Zod validation schema ───────────────────────────────────────────────────

const AgentConfigSchema = z.object({
  systemPrompt: z.string().optional(),
  maxTokens: z.number().optional(),
  tools: z.array(z.string()).optional(),
  workingDirectory: z.string().optional(),
  timeout: z.number().optional(),
})

const IncomingMessageSchema = z.object({
  type: z.enum(['run_agent', 'stop_agent', 'ping', 'config_update']),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  prompt: z.string().optional(),
  config: AgentConfigSchema.optional(),
})

// ── Event type definitions ──────────────────────────────────────────────────

interface BackendConnectionEvents {
  connected: []
  disconnected: []
  message: [data: IncomingMessage]
  'status-change': [status: ConnectionStatus]
  error: [message: string]
  'max-reconnect-reached': []
}

// ── Class ───────────────────────────────────────────────────────────────────

export class BackendConnection extends EventEmitter {
  private ws: WebSocket | null = null
  private token: string | null = null
  private backendUrl: string | null = null
  private status: ConnectionStatus = 'disconnected'
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private heartbeatInterval: number = 30000
  private messageQueue: OutgoingMessage[] = []
  private manualDisconnect: boolean = false

  // Callback to fetch current state – set by Orchestrator
  public getOrchestratorState: (() => OrchestratorState) | null = null

  // ── Public API ──────────────────────────────────────────────────────────

  async connect(backendUrl: string, token: string): Promise<void> {
    this.backendUrl = backendUrl
    this.token = token
    this.manualDisconnect = false

    this.setStatus('connecting')

    // Validate token against backend API before connecting WebSocket
    const host = this.stripProtocol(backendUrl).replace(/\/+$/, '')
    const isLocal = host.includes('localhost') || host.includes('.test') || host.includes('127.0.0.1')

    try {
      await this.validateToken(host, token, isLocal)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('error', `Token validation failed: ${msg}`)
      this.setStatus('error')
      this.emit('error', `Authentication failed: ${msg}`)
      this.setStatus('disconnected')
      this.emit('disconnected')
      return
    }

    // Build Reverb-compatible WebSocket URL
    const protocol = isLocal ? 'ws' : 'wss'
    const port = isLocal ? ':8080' : ''
    const appKey = 'orchestrator-key'
    const url = `${protocol}://${host}${port}/app/${appKey}?token=${encodeURIComponent(token)}`

    this.doConnect(url)
  }

  private validateToken(host: string, token: string, _isLocal: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const apiUrl = `https://${host}/api/v1/plan/limits`

      const req = https.get(apiUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        rejectUnauthorized: false,
      }, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else if (res.statusCode === 401) {
          reject(new Error('Invalid token'))
        } else {
          reject(new Error(`Unexpected response: ${res.statusCode}`))
        }
        res.resume()
      })

      req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)))
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')) })
    })
  }

  disconnect(): void {
    this.manualDisconnect = true
    this.clearReconnectTimer()
    this.stopHeartbeat()

    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }

    this.setStatus('disconnected')
    log('info', 'Manually disconnected from backend')
    this.emit('disconnected')
  }

  send(message: OutgoingMessage): void {
    if (this.status === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      // Queue message for when we reconnect
      if (this.messageQueue.length < MAX_QUEUE_SIZE) {
        this.messageQueue.push(message)
        log('debug', `Message queued (${this.messageQueue.length}/${MAX_QUEUE_SIZE}): ${message.type}`)
      } else {
        log('warn', 'Message queue full, dropping message')
      }
    }
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  get connected(): boolean {
    return this.status === 'connected'
  }

  destroy(): void {
    this.disconnect()
    this.messageQueue = []
    this.removeAllListeners()
  }

  // ── Private: Connection ─────────────────────────────────────────────────

  private doConnect(url: string): void {
    // Clean up any existing connection
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }

    log('info', `Connecting to backend: ${url.replace(/token=[^&]+/, 'token=***')}`)

    try {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        rejectUnauthorized: false,
      })
    } catch (err) {
      const msg = `Failed to create WebSocket: ${(err as Error).message}`
      log('error', msg)
      this.setStatus('error')
      this.emit('error', msg)
      return
    }

    // ── open ──────────────────────────────────────────────────────────
    this.ws.on('open', () => {
      this.setStatus('connected')
      this.reconnectAttempts = 0
      log('info', 'Connected to backend')

      this.startHeartbeat()
      this.flushMessageQueue()

      // Send initial connected message with current state
      const state = this.getOrchestratorState?.() ?? null
      const connectedMsg: OutgoingMessage = {
        type: 'connected',
        state: state ?? undefined,
        timestamp: Date.now(),
      }
      this.ws!.send(JSON.stringify(connectedMsg))

      this.emit('connected')
    })

    // ── message ───────────────────────────────────────────────────────
    this.ws.on('message', (raw: WebSocket.Data) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString())
      } catch (err) {
        log('error', `Failed to parse backend message: ${(err as Error).message}`)
        return
      }

      // Reverb speaks the Pusher protocol – those frames carry `event`, not `type`
      const frame = parsed as Record<string, unknown>
      if (typeof frame?.event === 'string') {
        this.handlePusherFrame(frame)
        return
      }

      const result = IncomingMessageSchema.safeParse(parsed)
      if (!result.success) {
        log('debug', `Ignoring unrecognized backend message (type=${frame?.type ?? 'undefined'})`)
        return
      }

      const message = result.data as IncomingMessage

      // Respond to ping immediately
      if (message.type === 'ping') {
        log('debug', 'Received ping, sending pong')
        const pong: OutgoingMessage = {
          type: 'pong',
          timestamp: Date.now(),
        }
        this.ws?.send(JSON.stringify(pong))
        return
      }

      this.emit('message', message)
    })

    // ── close ─────────────────────────────────────────────────────────
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.stopHeartbeat()
      this.setStatus('disconnected')
      log('info', `Backend connection closed (code: ${code}, reason: ${reason.toString() || 'none'})`)
      this.emit('disconnected')

      if (!this.manualDisconnect) {
        this.reconnect()
      }
    })

    // ── error ─────────────────────────────────────────────────────────
    this.ws.on('error', (err: Error) => {
      const msg = `WebSocket error: ${err.message}`
      log('error', msg)
      this.setStatus('error')
      this.emit('error', msg)
    })
  }

  // ── Private: Pusher/Reverb protocol ─────────────────────────────────────

  private handlePusherFrame(frame: Record<string, unknown>): void {
    const event = frame.event as string
    const data = this.parseFrameData(frame.data)

    switch (event) {
      case 'pusher:connection_established':
        log('debug', `Reverb connection established (socket ${data?.socket_id ?? 'unknown'})`)
        return

      case 'pusher:ping':
        this.ws?.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
        log('debug', 'Reverb ping received, sent pong')
        return

      case 'pusher:pong':
        log('debug', 'Reverb pong received')
        return

      case 'pusher:error':
        log('debug', `Reverb error (code ${data?.code ?? '?'}): ${data?.message ?? 'unknown'}`)
        return

      case 'pusher_internal:subscription_succeeded':
        log('debug', `Subscribed to channel ${frame.channel ?? '?'}`)
        return
    }

    // Application broadcast (e.g. run_agent on private-user.{id}) – payload sits in `data`
    const result = IncomingMessageSchema.safeParse(data)
    if (!result.success) {
      log('debug', `Ignoring unrecognized backend event "${event}"`)
      return
    }

    this.emit('message', result.data as IncomingMessage)
  }

  private parseFrameData(data: unknown): Record<string, any> | null {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data)
      } catch {
        return null
      }
    }
    return (data as Record<string, any>) ?? null
  }

  // ── Private: Reconnect ──────────────────────────────────────────────────

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const msg = `Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`
      log('error', msg)
      this.emit('max-reconnect-reached')
      return
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    log('info', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      if (this.backendUrl && this.token) {
        const url = `wss://${this.stripProtocol(this.backendUrl)}/app/orchestrator?token=${encodeURIComponent(this.token)}`
        this.setStatus('connecting')
        this.doConnect(url)
      }
    }, delay)
  }

  // ── Private: Heartbeat ──────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        log('warn', 'Heartbeat detected dead connection, triggering reconnect')
        this.stopHeartbeat()

        if (this.ws) {
          this.ws.removeAllListeners()
          this.ws.close()
          this.ws = null
        }

        this.setStatus('disconnected')
        this.emit('disconnected')

        if (!this.manualDisconnect) {
          this.reconnect()
        }
        return
      }

      // Reverb only accepts Pusher-protocol frames – a `{type:'pong'}` frame
      // is answered with a pusher:error on every beat
      this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }))
      log('debug', 'Heartbeat sent')
    }, this.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // ── Private: Helpers ────────────────────────────────────────────────────

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return

    log('info', `Flushing ${this.messageQueue.length} queued message(s)`)

    const queued = [...this.messageQueue]
    this.messageQueue = []

    for (const msg of queued) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg))
      } else {
        // Connection lost again mid-flush, re-queue remaining
        this.messageQueue.push(msg)
      }
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus
      this.emit('status-change', newStatus)
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private stripProtocol(url: string): string {
    return url.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '')
  }
}

// ── Singleton export ────────────────────────────────────────────────────────

export const backendConnection = new BackendConnection()

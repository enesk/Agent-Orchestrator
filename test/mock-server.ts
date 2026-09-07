import WebSocket, { WebSocketServer } from 'ws'
import { createServer, Server as HttpServer } from 'http'
import type { OutgoingMessage } from '../src/shared/types'

export class MockReverbServer {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private clients: Map<string, WebSocket> = new Map()
  private clientCounter = 0

  receivedMessages: OutgoingMessage[] = []

  private messageWaiters: Array<{
    type: string
    resolve: (msg: OutgoingMessage) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []

  async start(port: number = 8765): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer()
      this.wss = new WebSocketServer({ server: this.httpServer })

      this.wss.on('connection', (ws: WebSocket) => {
        const clientId = `client-${++this.clientCounter}`
        this.clients.set(clientId, ws)

        ws.on('message', (raw: WebSocket.Data) => {
          try {
            const msg = JSON.parse(raw.toString()) as OutgoingMessage
            this.receivedMessages.push(msg)
            this.resolveWaiters(msg)
          } catch {
            // Ignore non-JSON messages
          }
        })

        ws.on('close', () => {
          this.clients.delete(clientId)
        })
      })

      this.httpServer.on('error', reject)
      this.httpServer.listen(port, () => {
        resolve()
      })
    })
  }

  sendRunAgentCommand(
    ws: WebSocket,
    params: { agentId: string; sessionId: string; prompt: string; config?: Record<string, unknown> },
  ): void {
    const msg = {
      type: 'run_agent',
      agentId: params.agentId,
      sessionId: params.sessionId,
      prompt: params.prompt,
      config: params.config ?? {},
    }
    ws.send(JSON.stringify(msg))
  }

  sendStopAgentCommand(ws: WebSocket, params: { agentId: string; sessionId: string }): void {
    const msg = {
      type: 'stop_agent',
      agentId: params.agentId,
      sessionId: params.sessionId,
    }
    ws.send(JSON.stringify(msg))
  }

  sendPing(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: 'ping', agentId: '', sessionId: '' }))
  }

  sendMessage(ws: WebSocket, msg: Record<string, unknown>): void {
    ws.send(JSON.stringify(msg))
  }

  waitForMessage(type: string, timeoutMs: number = 5000): Promise<OutgoingMessage> {
    // Check if we already have a matching message
    const existing = this.receivedMessages.find((m) => m.type === type)
    if (existing) {
      this.receivedMessages = this.receivedMessages.filter((m) => m !== existing)
      return Promise.resolve(existing)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.messageWaiters = this.messageWaiters.filter((w) => w.resolve !== resolve)
        reject(new Error(`Timeout waiting for message type "${type}" after ${timeoutMs}ms`))
      }, timeoutMs)

      this.messageWaiters.push({ type, resolve, reject, timer })
    })
  }

  waitForMessageCount(count: number, timeoutMs: number = 5000): Promise<OutgoingMessage[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${count} messages (got ${this.receivedMessages.length})`))
      }, timeoutMs)

      const check = () => {
        if (this.receivedMessages.length >= count) {
          clearTimeout(timer)
          resolve([...this.receivedMessages])
          return
        }
        setTimeout(check, 50)
      }
      check()
    })
  }

  getFirstClient(): WebSocket | undefined {
    return this.clients.values().next().value
  }

  getClientCount(): number {
    return this.clients.size
  }

  clearMessages(): void {
    this.receivedMessages = []
  }

  disconnectAllClients(): void {
    this.clients.forEach((ws) => ws.close())
    this.clients.clear()
  }

  async stop(): Promise<void> {
    // Clear pending waiters
    this.messageWaiters.forEach((w) => {
      clearTimeout(w.timer)
      w.reject(new Error('Server stopped'))
    })
    this.messageWaiters = []

    // Close all client connections
    this.clients.forEach((ws) => ws.close())
    this.clients.clear()

    // Close WebSocket server
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    // Close HTTP server
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.httpServer = null
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  private resolveWaiters(msg: OutgoingMessage): void {
    const matched = this.messageWaiters.filter((w) => w.type === msg.type)
    this.messageWaiters = this.messageWaiters.filter((w) => w.type !== msg.type)

    for (const waiter of matched) {
      clearTimeout(waiter.timer)
      // Remove from receivedMessages since waiter consumed it
      const idx = this.receivedMessages.indexOf(msg)
      if (idx >= 0) this.receivedMessages.splice(idx, 1)
      waiter.resolve(msg)
    }
  }
}

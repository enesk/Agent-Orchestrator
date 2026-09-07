import { BackendConnection } from '../src/main/BackendConnection'
import { MockReverbServer } from './mock-server'
import type { OutgoingMessage } from '../src/shared/types'

describe('BackendConnection', () => {
  let mockServer: MockReverbServer

  beforeAll(async () => {
    mockServer = new MockReverbServer()
    await mockServer.start(8766)
  })

  afterAll(async () => {
    await mockServer.stop()
  })

  afterEach(() => {
    mockServer.clearMessages()
    mockServer.disconnectAllClients()
  })

  test('connect: establishes WebSocket connection', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    // BackendConnection builds wss:// URL, but our mock is ws://
    // We need to test with raw doConnect via a workaround:
    // Connect with a URL that BackendConnection strips protocol from
    // The actual WebSocket connects to ws://localhost:8766
    ;(conn as any).backendUrl = 'localhost:8766'
    ;(conn as any).token = 'test-token'
    ;(conn as any).manualDisconnect = false
    ;(conn as any).setStatus('connecting')
    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')

    await connectedPromise

    expect(conn.getStatus()).toBe('connected')
    expect(conn.connected).toBe(true)

    conn.destroy()
  })

  test('connect: sends "connected" message on open', async () => {
    const conn = new BackendConnection()
    conn.getOrchestratorState = () => ({
      connected: true,
      claudeRunning: false,
      activeSessions: 0,
      userToken: null,
      backendUrl: null,
      userEmail: null,
      planName: null,
      lastConnectedAt: null,
      version: '1.0.0',
    })

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    const msg = await mockServer.waitForMessage('connected', 2000)
    expect(msg.type).toBe('connected')
    expect(msg.state).toBeDefined()

    conn.destroy()
  })

  test('send: delivers message when connected', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    // Clear the initial 'connected' message
    await mockServer.waitForMessage('connected', 1000)
    mockServer.clearMessages()

    const testMsg: OutgoingMessage = {
      type: 'status',
      data: 'test-data',
      timestamp: Date.now(),
    }
    conn.send(testMsg)

    const received = await mockServer.waitForMessage('status', 2000)
    expect(received.type).toBe('status')
    expect(received.data).toBe('test-data')

    conn.destroy()
  })

  test('send: queues messages when disconnected', () => {
    const conn = new BackendConnection()

    const msg1: OutgoingMessage = { type: 'output', data: 'chunk1', timestamp: Date.now() }
    const msg2: OutgoingMessage = { type: 'output', data: 'chunk2', timestamp: Date.now() }
    const msg3: OutgoingMessage = { type: 'output', data: 'chunk3', timestamp: Date.now() }

    conn.send(msg1)
    conn.send(msg2)
    conn.send(msg3)

    expect((conn as any).messageQueue).toHaveLength(3)

    conn.destroy()
  })

  test('message queue: flushes queued messages after reconnect', async () => {
    const conn = new BackendConnection()

    // Queue messages while disconnected
    const msg1: OutgoingMessage = { type: 'output', data: 'queued-1', timestamp: Date.now() }
    const msg2: OutgoingMessage = { type: 'completed', data: 'queued-2', timestamp: Date.now() }
    conn.send(msg1)
    conn.send(msg2)

    expect((conn as any).messageQueue).toHaveLength(2)

    // Now connect
    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    // Wait for flushed messages to arrive (after the 'connected' message)
    const messages = await mockServer.waitForMessageCount(3, 3000)

    const types = messages.map((m) => m.type)
    expect(types).toContain('connected')
    expect(types).toContain('output')
    expect(types).toContain('completed')

    // Queue should be empty
    expect((conn as any).messageQueue).toHaveLength(0)

    conn.destroy()
  })

  test('message queue: caps at MAX_QUEUE_SIZE (50)', () => {
    const conn = new BackendConnection()

    for (let i = 0; i < 55; i++) {
      conn.send({ type: 'output', data: `msg-${i}`, timestamp: Date.now() })
    }

    expect((conn as any).messageQueue).toHaveLength(50)

    conn.destroy()
  })

  test('ping: responds with pong automatically', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise
    await mockServer.waitForMessage('connected', 1000)
    mockServer.clearMessages()

    // Send ping from server
    const client = mockServer.getFirstClient()
    expect(client).toBeDefined()
    mockServer.sendPing(client!)

    // Should receive pong back
    const pong = await mockServer.waitForMessage('pong', 2000)
    expect(pong.type).toBe('pong')
    expect(pong.timestamp).toBeGreaterThan(0)

    conn.destroy()
  })

  test('message: emits parsed incoming messages', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    const messagePromise = new Promise<any>((resolve) => {
      conn.on('message', resolve)
    })

    const client = mockServer.getFirstClient()!
    mockServer.sendRunAgentCommand(client, {
      agentId: '42',
      sessionId: 'sess-1',
      prompt: 'Hello world',
    })

    const msg = await messagePromise
    expect(msg.type).toBe('run_agent')
    expect(msg.agentId).toBe('42')
    expect(msg.sessionId).toBe('sess-1')
    expect(msg.prompt).toBe('Hello world')

    conn.destroy()
  })

  test('message: ignores invalid JSON', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    const messages: unknown[] = []
    conn.on('message', (msg) => messages.push(msg))

    const client = mockServer.getFirstClient()!
    client.send('not json at all')

    // Give some time for processing
    await new Promise((r) => setTimeout(r, 200))
    expect(messages).toHaveLength(0)

    conn.destroy()
  })

  test('pusher: ignores Reverb control frames without emitting', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    const messages: unknown[] = []
    conn.on('message', (msg) => messages.push(msg))

    const client = mockServer.getFirstClient()!
    mockServer.sendMessage(client, {
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456', activity_timeout: 30 }),
    })
    mockServer.sendMessage(client, {
      event: 'pusher:error',
      data: { code: 4009, message: 'Unknown event' },
    })

    await new Promise((r) => setTimeout(r, 200))
    expect(messages).toHaveLength(0)

    conn.destroy()
  })

  test('pusher: unwraps broadcast events into incoming messages', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    const messagePromise = new Promise<any>((resolve) => {
      conn.on('message', resolve)
    })

    const client = mockServer.getFirstClient()!
    mockServer.sendMessage(client, {
      event: 'run_agent',
      channel: 'private-user.1',
      data: JSON.stringify({
        type: 'run_agent',
        agentId: '7',
        sessionId: 'sess-pusher',
        prompt: 'From Reverb',
        config: {},
      }),
    })

    const msg = await messagePromise
    expect(msg.type).toBe('run_agent')
    expect(msg.agentId).toBe('7')
    expect(msg.prompt).toBe('From Reverb')

    conn.destroy()
  })

  test('disconnect: sets status to disconnected and prevents reconnect', async () => {
    const conn = new BackendConnection()

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    const disconnectedPromise = new Promise<void>((resolve) => {
      conn.on('disconnected', resolve)
    })

    conn.disconnect()
    await disconnectedPromise

    expect(conn.getStatus()).toBe('disconnected')
    expect(conn.connected).toBe(false)
    expect((conn as any).manualDisconnect).toBe(true)
  })

  test('status-change: emits status transitions', async () => {
    const conn = new BackendConnection()
    const statuses: string[] = []

    conn.on('status-change', (status) => statuses.push(status))

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    expect(statuses).toContain('connecting')
    expect(statuses).toContain('connected')

    conn.disconnect()
    expect(statuses).toContain('disconnected')
  })

  test('reconnect: attempts reconnection after server-side close', async () => {
    const conn = new BackendConnection()
    // Use very short backoff for testing
    ;(conn as any).maxReconnectAttempts = 2

    const connectedPromise = new Promise<void>((resolve) => {
      conn.on('connected', resolve)
    })

    ;(conn as any).doConnect('ws://localhost:8766/app/orchestrator?token=test-token')
    await connectedPromise

    // Track disconnected events
    let disconnectCount = 0
    conn.on('disconnected', () => disconnectCount++)

    // Force close from server
    mockServer.disconnectAllClients()

    // Wait for disconnect to be detected
    await new Promise((r) => setTimeout(r, 500))
    expect(disconnectCount).toBeGreaterThanOrEqual(1)

    // A reconnect timer should have been scheduled
    expect((conn as any).reconnectTimer).not.toBeNull()

    conn.destroy()
  })

  test('max-reconnect-reached: emits after exhausting attempts', async () => {
    const conn = new BackendConnection()
    ;(conn as any).maxReconnectAttempts = 0 // Already at max

    const maxReachedPromise = new Promise<void>((resolve) => {
      conn.on('max-reconnect-reached', resolve)
    })

    // Trigger reconnect logic directly
    ;(conn as any).reconnect()

    await maxReachedPromise
    conn.destroy()
  })
})

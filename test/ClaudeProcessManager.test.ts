import { EventEmitter } from 'events'
import { ChildProcess } from 'child_process'
import * as childProcess from 'child_process'
import * as fs from 'fs'
import { ClaudeProcessManager } from '../src/main/ClaudeProcessManager'

// ── Helpers ─────────────────────────────────────────────────────────────────

interface MockChildProcess extends EventEmitter {
  stdin: { write: jest.Mock }
  stdout: EventEmitter & { setEncoding: jest.Mock }
  stderr: EventEmitter & { setEncoding: jest.Mock }
  kill: jest.Mock
  exitCode: number | null
  pid: number
}

function createMockChildProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess
  proc.stdin = { write: jest.fn() }

  const stdout = new EventEmitter() as MockChildProcess['stdout']
  stdout.setEncoding = jest.fn()
  proc.stdout = stdout

  const stderr = new EventEmitter() as MockChildProcess['stderr']
  stderr.setEncoding = jest.fn()
  proc.stderr = stderr

  proc.kill = jest.fn()
  proc.exitCode = null
  proc.pid = 12345
  return proc
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ClaudeProcessManager', () => {
  let spawnSpy: jest.SpyInstance
  let execFileSpy: jest.SpyInstance
  let existsSyncSpy: jest.SpyInstance
  let mockProc: MockChildProcess

  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
    mockProc = createMockChildProcess()
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue(mockProc as unknown as ChildProcess)
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true)
    execFileSpy = jest.spyOn(childProcess, 'execFile').mockImplementation(
      (_cmd: string, _args: any, _opts: any, cb: any) => {
        cb(null, '/usr/local/bin/claude\n')
        return {} as ChildProcess
      },
    )
  })

  test('start: emits "ready" event on successful start', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')

    const readyPromise = new Promise<void>((resolve) => {
      manager.on('ready', resolve)
    })

    await manager.start()
    await readyPromise

    expect(spawnSpy).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      ['--output-format', 'stream-json', '--dangerously-skip-permissions', '--no-color'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    )
    expect(manager.isRunning()).toBe(true)
  })

  test('start: emits "error" when claude binary not found', async () => {
    existsSyncSpy.mockReturnValue(false)
    execFileSpy.mockImplementation((_cmd: string, _args: any, _opts: any, cb: any) => {
      cb(new Error('not found'))
      return {} as ChildProcess
    })

    const manager = new ClaudeProcessManager('/nonexistent/claude')

    const errorPromise = new Promise<string>((resolve) => {
      manager.on('error', resolve)
    })

    await manager.start()
    const errorMsg = await errorPromise

    expect(errorMsg).toContain('Claude Code CLI not found')
    expect(manager.isRunning()).toBe(false)
  })

  test('start: spawns with correct arguments', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    expect(spawnSpy).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      ['--output-format', 'stream-json', '--dangerously-skip-permissions', '--no-color'],
      expect.any(Object),
    )
  })

  test('stdout: parses JSON lines and emits "output"', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const outputs: unknown[] = []
    manager.on('output', (data) => outputs.push(data))

    const jsonLine = JSON.stringify({ type: 'assistant', content: 'Hello', session_id: 'abc' })
    mockProc.stdout.emit('data', jsonLine + '\n')

    expect(outputs).toHaveLength(1)
    expect(outputs[0]).toEqual({ type: 'assistant', content: 'Hello', session_id: 'abc' })
  })

  test('stdout: emits "raw-output" for non-JSON lines', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const rawOutputs: string[] = []
    manager.on('raw-output', (data) => rawOutputs.push(data))

    mockProc.stdout.emit('data', 'This is not JSON\n')

    expect(rawOutputs).toHaveLength(1)
    expect(rawOutputs[0]).toBe('This is not JSON')
  })

  test('stdout: handles partial lines across chunks', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const outputs: unknown[] = []
    manager.on('output', (data) => outputs.push(data))

    const fullJson = JSON.stringify({ type: 'result', content: 'done' })
    const part1 = fullJson.substring(0, 15)
    const part2 = fullJson.substring(15) + '\n'

    mockProc.stdout.emit('data', part1)
    expect(outputs).toHaveLength(0) // Not complete yet

    mockProc.stdout.emit('data', part2)
    expect(outputs).toHaveLength(1)
    expect(outputs[0]).toEqual({ type: 'result', content: 'done' })
  })

  test('stdout: handles multiple JSON lines in one chunk', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const outputs: unknown[] = []
    manager.on('output', (data) => outputs.push(data))

    const line1 = JSON.stringify({ type: 'assistant', content: 'Hello' })
    const line2 = JSON.stringify({ type: 'assistant', content: 'World' })
    mockProc.stdout.emit('data', line1 + '\n' + line2 + '\n')

    expect(outputs).toHaveLength(2)
  })

  test('stderr: emits "error" event', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const errors: string[] = []
    manager.on('error', (msg) => errors.push(msg))

    mockProc.stderr.emit('data', 'Something went wrong\n')

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Something went wrong')
  })

  test('sendCommand: writes to stdin and emits "command-sent"', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const sentCommands: string[] = []
    manager.on('command-sent', (input) => sentCommands.push(input))

    manager.sendCommand('Write a hello world function')

    expect(mockProc.stdin.write).toHaveBeenCalledWith('Write a hello world function\n')
    expect(sentCommands).toEqual(['Write a hello world function'])
  })

  test('sendCommand: does nothing when process is not running', () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    // Don't call start

    const sentCommands: string[] = []
    manager.on('command-sent', (input) => sentCommands.push(input))

    manager.sendCommand('test')

    expect(sentCommands).toHaveLength(0)
  })

  test('close: emits "crashed" and triggers auto-restart', async () => {
    jest.useFakeTimers()

    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const crashes: number[] = []
    manager.on('crashed', (code) => crashes.push(code))

    // Simulate process exit
    mockProc.exitCode = 1
    mockProc.emit('close', 1)

    expect(crashes).toEqual([1])
    expect(manager.isRunning()).toBe(false)

    // Should schedule restart after restartDelay (2000ms)
    // Create a new mock process for the restart
    const newMock = createMockChildProcess()
    spawnSpy.mockReturnValue(newMock as unknown as ChildProcess)

    jest.advanceTimersByTime(2100)

    // spawn should be called again for restart
    expect(spawnSpy).toHaveBeenCalledTimes(2)

    jest.useRealTimers()
  })

  test('close: emits "fatal-error" after max restart attempts', async () => {
    jest.useFakeTimers()

    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    // Access private field for testing
    ;(manager as any).maxRestartAttempts = 2
    ;(manager as any).restartDelay = 100

    await manager.start()

    const fatalErrors: string[] = []
    manager.on('fatal-error', (msg) => fatalErrors.push(msg))

    // First crash -> restartAttempts = 1
    mockProc.emit('close', 1)
    jest.advanceTimersByTime(200)

    // Second crash -> restartAttempts = 2
    const newMock1 = createMockChildProcess()
    spawnSpy.mockReturnValue(newMock1 as unknown as ChildProcess)
    jest.advanceTimersByTime(200)
    newMock1.emit('close', 1)
    jest.advanceTimersByTime(500)

    // Third crash -> exceeds max, should emit fatal-error
    const newMock2 = createMockChildProcess()
    spawnSpy.mockReturnValue(newMock2 as unknown as ChildProcess)
    jest.advanceTimersByTime(500)
    newMock2.emit('close', 1)

    expect(fatalErrors.length).toBeGreaterThanOrEqual(1)
    expect(fatalErrors[0]).toContain('crashed')

    jest.useRealTimers()
  })

  test('stop: terminates process gracefully', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    const stoppedPromise = new Promise<void>((resolve) => {
      manager.on('stopped', resolve)
    })

    // Simulate process responding to SIGTERM
    mockProc.kill.mockImplementation(() => {
      process.nextTick(() => {
        mockProc.exitCode = 0
        mockProc.emit('close', 0)
      })
    })

    await manager.stop()
    await stoppedPromise

    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
    expect(manager.isRunning()).toBe(false)
  })

  test('stop: sends SIGKILL if process does not exit within 3s', async () => {
    jest.useFakeTimers()

    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    // Process ignores SIGTERM
    mockProc.kill.mockImplementation((signal: string) => {
      if (signal === 'SIGKILL') {
        process.nextTick(() => {
          mockProc.exitCode = 137
          mockProc.emit('close', 137)
        })
      }
    })

    const stopPromise = manager.stop()

    // Advance past the 3s kill timeout
    jest.advanceTimersByTime(3100)

    await stopPromise

    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
    expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL')

    jest.useRealTimers()
  })

  test('stop: does not auto-restart after intentional stop', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')
    await manager.start()

    mockProc.kill.mockImplementation(() => {
      process.nextTick(() => {
        mockProc.exitCode = 0
        mockProc.emit('close', 0)
      })
    })

    await manager.stop()

    // spawn should only have been called once (initial start)
    expect(spawnSpy).toHaveBeenCalledTimes(1)
  })

  test('detectClaudePath: returns path from which command', async () => {
    const manager = new ClaudeProcessManager()
    const detectedPath = await manager.detectClaudePath()
    expect(detectedPath).toBe('/usr/local/bin/claude')
  })

  test('detectClaudePath: falls back to known paths when which fails', async () => {
    execFileSpy.mockImplementation((_cmd: string, _args: any, _opts: any, cb: any) => {
      cb(new Error('not found'))
      return {} as ChildProcess
    })
    existsSyncSpy.mockImplementation((p: string) => {
      return p === '/usr/local/bin/claude'
    })

    const manager = new ClaudeProcessManager()
    const detectedPath = await manager.detectClaudePath()
    expect(detectedPath).toBe('/usr/local/bin/claude')
  })

  test('detectClaudePath: returns "claude" as final fallback', async () => {
    execFileSpy.mockImplementation((_cmd: string, _args: any, _opts: any, cb: any) => {
      cb(new Error('not found'))
      return {} as ChildProcess
    })
    existsSyncSpy.mockReturnValue(false)

    const manager = new ClaudeProcessManager()
    const detectedPath = await manager.detectClaudePath()
    expect(detectedPath).toBe('claude')
  })

  test('isRunning: returns correct state', async () => {
    const manager = new ClaudeProcessManager('/usr/local/bin/claude')

    expect(manager.isRunning()).toBe(false)

    await manager.start()
    expect(manager.isRunning()).toBe(true)

    mockProc.exitCode = 0
    mockProc.emit('close', 0)
    expect(manager.isRunning()).toBe(false)
  })
})

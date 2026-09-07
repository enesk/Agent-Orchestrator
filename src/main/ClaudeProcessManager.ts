import { ChildProcess, spawn, execFile } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import path from 'path'
import { log } from './Logger'

// ── Event type definitions ──────────────────────────────────────────────────

interface ClaudeProcessEvents {
  ready: []
  output: [data: { type: string; content?: string; session_id?: string;[key: string]: unknown }]
  'raw-output': [data: string]
  error: [message: string]
  crashed: [exitCode: number]
  stopped: []
  'fatal-error': [message: string]
  'command-sent': [input: string]
}

// ── Class ───────────────────────────────────────────────────────────────────

export class ClaudeProcessManager extends EventEmitter {
  private process: ChildProcess | null = null
  private isStarted: boolean = false
  private claudePath: string
  private restartAttempts: number = 0
  private maxRestartAttempts: number = 5
  private restartDelay: number = 2000
  private outputBuffer: string = ''

  constructor(claudePath: string = 'claude') {
    super()
    this.claudePath = claudePath
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Resolve claude binary path if using the default
    if (this.claudePath === 'claude') {
      this.claudePath = await this.detectClaudePath()
    }

    // Verify claude binary exists
    const resolved = await this.verifyClaudeExists(this.claudePath)
    if (!resolved) {
      const msg =
        'Claude Code CLI not found. Please install it first:\n' +
        '  npm install -g @anthropic-ai/claude-code\n' +
        'Or set the correct path in Settings.'
      log('error', msg)
      this.emit('error', msg)
      return
    }

    log('info', `Starting Claude Code CLI: ${this.claudePath}`)

    this.process = spawn(
      this.claudePath,
      ['-p', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json', '--dangerously-skip-permissions'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    )

    this.process.stdout!.setEncoding('utf8')

    // ── stdout ──────────────────────────────────────────────────────────
    this.process.stdout!.on('data', (chunk: string) => {
      log('info', `[CPM] stdout chunk (${chunk.length} bytes): ${chunk.substring(0, 150)}`)
      this.outputBuffer += chunk

      const lines = this.outputBuffer.split('\n')
      // Keep the last (potentially incomplete) line in the buffer
      this.outputBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const parsed = JSON.parse(trimmed)
          log('info', `[CPM] Parsed event type="${parsed.type}"`)
          this.emit('output', parsed)
        } catch {
          log('info', `[CPM] Raw (not JSON): ${trimmed.substring(0, 100)}`)
          this.emit('raw-output', trimmed)
        }
      }
    })

    // ── stderr ──────────────────────────────────────────────────────────
    this.process.stderr!.setEncoding('utf8')
    this.process.stderr!.on('data', (data: string) => {
      const text = data.trim()
      if (text) {
        log('error', `Claude stderr: ${text}`)
        this.emit('error', text)
      }
    })

    // ── close ───────────────────────────────────────────────────────────
    this.process.on('close', (code: number | null) => {
      this.isStarted = false
      this.process = null

      const exitCode = code ?? 1
      log('warn', `Claude process exited with code ${exitCode}`)
      this.emit('crashed', exitCode)

      // Exponential backoff restart
      if (this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++
        const delay = Math.min(this.restartDelay, 30000)
        log('info', `Restart attempt ${this.restartAttempts}/${this.maxRestartAttempts} in ${delay}ms`)

        setTimeout(() => {
          this.start()
        }, delay)

        // Double delay for next attempt
        this.restartDelay = Math.min(this.restartDelay * 2, 30000)
      } else {
        const msg = `Claude process crashed ${this.maxRestartAttempts} times. Giving up. Please restart manually.`
        log('error', msg)
        this.emit('fatal-error', msg)
      }
    })

    // ── spawn error ─────────────────────────────────────────────────────
    this.process.on('error', (err: Error) => {
      this.isStarted = false
      this.process = null
      const msg = `Failed to spawn Claude process: ${err.message}`
      log('error', msg)
      this.emit('error', msg)
    })

    this.isStarted = true
    this.outputBuffer = ''
    log('info', 'Claude Code CLI started successfully')
    this.emit('ready')
  }

  async stop(): Promise<void> {
    if (!this.process) {
      this.isStarted = false
      this.emit('stopped')
      return
    }

    log('info', 'Stopping Claude Code CLI...')

    // Prevent auto-restart on intentional stop
    const maxAttemptsBak = this.maxRestartAttempts
    this.maxRestartAttempts = 0

    const proc = this.process

    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        if (proc.exitCode === null) {
          log('warn', 'Claude did not exit gracefully, sending SIGKILL')
          proc.kill('SIGKILL')
        }
        resolve()
      }, 3000)

      proc.once('close', () => {
        clearTimeout(killTimer)
        resolve()
      })

      proc.kill('SIGTERM')
    })

    this.process = null
    this.isStarted = false
    this.restartAttempts = 0
    this.restartDelay = 2000
    this.maxRestartAttempts = maxAttemptsBak

    log('info', 'Claude Code CLI stopped')
    this.emit('stopped')
  }

  sendCommand(input: string): void {
    if (!this.isRunning()) {
      log('warn', '[CPM] Cannot send command: Claude process is not running')
      return
    }

    log('info', `[CPM] isRunning=${this.isRunning()}, pid=${this.process?.pid}, sending ${input.length} chars`)
    // Format as stream-json message for --input-format stream-json
    const message = JSON.stringify({ type: 'user', content: input })
    this.process!.stdin!.write(message + '\n')
    log('info', `[CPM] Command sent: ${input.substring(0, 120)}${input.length > 120 ? '...' : ''}`)
    this.emit('command-sent', input)
  }

  isRunning(): boolean {
    return this.isStarted && this.process !== null && this.process.exitCode === null
  }

  async detectClaudePath(): Promise<string> {
    const isWindows = process.platform === 'win32'

    // 1. Try which/where (system PATH lookup)
    const whichCmd = isWindows ? 'where' : 'which'
    const pathFromSystem = await this.execQuiet(whichCmd, ['claude'])
    if (pathFromSystem) return pathFromSystem

    // 2. Check known installation paths
    const candidates: string[] = isWindows
      ? [
          path.join(process.env.APPDATA ?? '', 'Claude', 'claude.exe'),
          'C:\\Program Files\\Claude\\claude.exe',
        ]
      : [
          path.join(process.env.HOME ?? '', '.claude', 'local', 'claude'),
          '/usr/local/bin/claude',
        ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        log('info', `Detected Claude at: ${candidate}`)
        return candidate
      }
    }

    // 3. Fallback – rely on $PATH
    log('info', 'Claude not found in known paths, falling back to "claude" from $PATH')
    return 'claude'
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async verifyClaudeExists(cmdPath: string): Promise<boolean> {
    // If it's an absolute path, check the file directly
    if (path.isAbsolute(cmdPath)) {
      return existsSync(cmdPath)
    }

    // Otherwise, try which/where
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    const result = await this.execQuiet(whichCmd, [cmdPath])
    return result !== null
  }

  private execQuiet(cmd: string, args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const result = stdout.toString().trim().split('\n')[0]?.trim()
        resolve(result || null)
      })
    })
  }
}

// ── Singleton export ────────────────────────────────────────────────────────

export const claudeProcessManager = new ClaudeProcessManager()

import { spawn } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveEffortForModel } from '@shared/constants'
import type { ClaudeStatus } from '@shared/types'

/**
 * Finden und Beschreiben der Claude-Code-CLI. Bewusst frei von Electron- und
 * Datenbank-Abhängigkeiten, damit sich die Erkennung auch außerhalb der App durchspielen lässt.
 */

const VERSION_TIMEOUT_MS = 8_000

/** Orte, an denen die CLI üblicherweise liegt, wenn sie nicht im PATH steht. */
function knownLocations(): string[] {
  const home = homedir()
  return [
    join(home, '.claude', 'local', 'bin', 'claude'),
    join(home, '.claude', 'local', 'claude'),
    join(home, '.local', 'bin', 'claude'),
    join(home, '.bun', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]
}

/**
 * Aus dem Dock oder dem Finder gestartete Apps erben eine sehr magere PATH-Variable.
 * Wir hängen die üblichen Verdächtigen an, damit `which` und der spätere Spawn etwas finden.
 */
export function augmentedPath(base = process.env.PATH ?? ''): string {
  const home = homedir()
  const extra = [
    join(home, '.claude', 'local', 'bin'),
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  const parts = base.split(':').filter(Boolean)
  for (const dir of extra) {
    if (!parts.includes(dir)) parts.push(dir)
  }
  return parts.join(':')
}

/** Prozessumgebung für alle CLI-Aufrufe. */
export function claudeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: augmentedPath() }
  // Ohne das hält sich die CLI für einen verschachtelten Aufruf und verweigert den Dienst.
  delete env.CLAUDECODE
  return env
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { env: claudeEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve({ code: null, stdout: '', stderr: '' })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(null)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', () => finish(null))
    child.on('close', (code) => finish(code))
  })
}

/**
 * Sucht die CLI: konfigurierter Pfad → `which claude` → bekannte Standardorte.
 * Liefert den ersten Treffer, der existiert und ausführbar ist.
 */
export async function detect(configuredPath?: string | null): Promise<string | null> {
  const configured = configuredPath?.trim()
  if (configured) {
    return isExecutableFile(configured) ? configured : null
  }

  const which = await run('which', ['claude'], VERSION_TIMEOUT_MS)
  if (which.code === 0) {
    const candidate = which.stdout.split('\n')[0]?.trim()
    if (candidate && isExecutableFile(candidate)) return candidate
  }

  for (const candidate of knownLocations()) {
    if (isExecutableFile(candidate)) return candidate
  }

  return null
}

/** Fragt `claude --version` ab. `null`, wenn die CLI nicht antwortet. */
export async function version(path: string): Promise<string | null> {
  const result = await run(path, ['--version'], VERSION_TIMEOUT_MS)
  if (result.code !== 0) return null
  const line = result.stdout.trim().split('\n')[0]?.trim()
  return line ? line : null
}

/**
 * Vollständiger Status für die Oberfläche. Ein konfigurierter, aber unbrauchbarer Pfad
 * ergibt eine andere Meldung als „gar nichts gefunden" — sonst sucht der Nutzer an der
 * falschen Stelle.
 */
export async function status(configuredPath?: string | null): Promise<ClaudeStatus> {
  const checkedAt = new Date().toISOString()
  const configured = configuredPath?.trim() || null

  const path = await detect(configured)
  if (!path) {
    return {
      available: false,
      path: null,
      version: null,
      error: configured
        ? `Unter „${configured}" liegt keine ausführbare Claude-CLI.`
        : 'Claude Code CLI wurde nicht gefunden. Pfad in den Einstellungen hinterlegen.',
      checkedAt,
    }
  }

  const detectedVersion = await version(path)
  if (!detectedVersion) {
    return {
      available: false,
      path,
      version: null,
      error: `„${path}" hat auf --version nicht geantwortet.`,
      checkedAt,
    }
  }

  return { available: true, path, version: detectedVersion, error: null, checkedAt }
}

export interface ClaudeArgsOptions {
  model: string
  effort?: string | null
  resumeId?: string | null
  systemPromptAppend?: string | null
  mcp?: { configJson: string; allowedTools: string[] } | null
  /** Plugin-Ordner mit den Skills des Agenten. `--disable-slash-commands` würde sie abschalten. */
  pluginDir?: string | null
}

/** Baut die Argumentliste eines Laufs. Rein, damit sie sich prüfen und protokollieren lässt. */
export function buildClaudeArgs(options: ClaudeArgsOptions): string[] {
  const args = ['-p', '--model', options.model]

  const effort = resolveEffortForModel(options.model, options.effort)
  if (effort) args.push('--effort', effort)

  args.push(
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  )

  if (options.systemPromptAppend?.trim()) {
    args.push('--append-system-prompt', options.systemPromptAppend)
  }

  if (options.mcp) {
    args.push('--mcp-config', options.mcp.configJson, '--strict-mcp-config')
    if (options.mcp.allowedTools.length > 0) {
      args.push('--allowedTools', options.mcp.allowedTools.join(','))
    }
  }

  if (options.pluginDir) args.push('--plugin-dir', options.pluginDir)

  if (options.resumeId) args.push('--resume', options.resumeId)

  return args
}

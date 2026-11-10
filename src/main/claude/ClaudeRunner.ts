import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { statSync } from 'node:fs'
import type { AgentEffort } from '@shared/constants'
import { buildClaudeArgs, claudeEnv } from './ClaudeCli'
import {
  acquire,
  buildScopeKey,
  discardOnResumeFailure,
  persist,
  release,
  type SessionScope,
} from './SessionCache'
import { StreamParser, detectRateLimit, type RateLimitHint } from './StreamParser'
import { RunError } from './RunError'
import { prepareSkillDirectory, type RunSkill } from './SkillDirectory'
import { resolveClaudeBinary } from './status'
import { describeError, scopedLogger } from '../Logger'
import { LANGUAGE_NAMES_DE } from '@shared/i18n'
import { getLanguage, getSettings, mainT } from '../app/settings'
// Direkt aus der Datei, nicht über '../mcp': das Modul hängt nur an Textbausteinen
// (`questions/prompt`) und zieht so keinen Kreis zwischen Runner und MCP-Server.
import { buildRestraintBlock } from '../mcp/toolInstructions'

const log = scopedLogger('claude.runner')

/** Ohne Datenverkehr so lange warten, dann den Prozess hart beenden. */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000
/** Nach `abort()` so lange auf ein sauberes Ende warten, dann SIGKILL. */
const KILL_GRACE_MS = 2_000
/** So viel stderr wird für die Fehlermeldung aufgehoben. */
const STDERR_LIMIT = 8_000

interface StreamFailure {
  message: string
  rateLimit: RateLimitHint | null
}

/** Konfiguration des lokalen MCP-Servers. Gebaut wird sie anderswo, hier nur durchgereicht. */
export interface RunMcpConfig {
  configJson: string
  allowedTools: string[]
}

export interface RunRequest {
  prompt: string
  cwd: string
  model: string
  effort?: AgentEffort | string | null
  scope: SessionScope
  mcp?: RunMcpConfig | null
  systemPromptAppend?: string | null
  /**
   * Skills des Agenten aus `scope.agentId`. Sie gehen ausschließlich als Plugin-Ordner an die
   * CLI, nie in den Prompt — sonst kosteten sie jeden Lauf, statt nur bei Bedarf geladen zu werden.
   */
  skills?: readonly RunSkill[] | null
  /** Freies Etikett fürs Protokoll und für `killByFilter`, z.B. `chat` oder `goal-worker`. */
  label?: string
}

export interface RunResult {
  text: string
  thinking: string
  sessionId: string | null
  turnCount: number
  /** `true`, wenn `abort()` den Lauf beendet hat — das ist kein Fehler. */
  aborted: boolean
  durationMs: number
}

export interface RunEventMap {
  text: string
  thinking: string
  toolStart: { name: string }
  toolEnd: { name: string | null }
  sessionId: string
  done: RunResult
  error: Error
}

export type RunEventName = keyof RunEventMap

/**
 * Minimaler typisierter Emitter. Kein `node:events`, weil dessen `error`-Event ohne Zuhörer
 * den Prozess abschießt — genau das falsche Verhalten für einen Agentenlauf.
 */
export class RunEmitter {
  private listeners = new Map<RunEventName, Set<(payload: never) => void>>()

  on<E extends RunEventName>(event: E, listener: (payload: RunEventMap[E]) => void): this {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener as (payload: never) => void)
    this.listeners.set(event, set)
    return this
  }

  off<E extends RunEventName>(event: E, listener: (payload: RunEventMap[E]) => void): this {
    this.listeners.get(event)?.delete(listener as (payload: never) => void)
    return this
  }

  emit<E extends RunEventName>(event: E, payload: RunEventMap[E]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of [...set]) {
      try {
        ;(listener as (value: RunEventMap[E]) => void)(payload)
      } catch (error) {
        log.error('Listener hat einen Fehler geworfen', { event, ...describeError(error) })
      }
    }
  }

  removeAll(): void {
    this.listeners.clear()
  }
}

export interface RunHandle {
  id: string
  scopeKey: string
  events: RunEmitter
  abort(): void
  done: Promise<RunResult>
}

/** Fehler mit Wartezeit, damit der Aufrufer sinnvoll erneut anlaufen kann. */
export class RateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export interface RunInfo {
  id: string
  scopeKey: string
  scope: SessionScope
  label: string | null
  model: string
  cwd: string
  startedAt: number
}

interface ActiveRun {
  info: RunInfo
  abort: () => void
}

const activeRuns = new Map<string, ActiveRun>()

export function listRuns(): RunInfo[] {
  return [...activeRuns.values()].map((entry) => entry.info)
}

/**
 * Beendet alle Läufe, auf die das Prädikat passt — z.B. alle eines Vorhabens oder eines
 * Agenten. Liefert die Anzahl der abgebrochenen Läufe.
 */
export function killByFilter(predicate: (info: RunInfo) => boolean): number {
  let killed = 0
  for (const entry of [...activeRuns.values()]) {
    if (!predicate(entry.info)) continue
    entry.abort()
    killed += 1
  }
  return killed
}

export function killAllRuns(): number {
  return killByFilter(() => true)
}

function assertUsableCwd(cwd: string): void {
  if (!cwd || !cwd.trim()) {
    throw new RunError('project_path', mainT()('main.error.noProjectPath'))
  }
  let stat
  try {
    stat = statSync(cwd)
  } catch {
    throw new Error(`Der Projektpfad „${cwd}" existiert nicht.`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Der Projektpfad „${cwd}" ist kein Verzeichnis.`)
  }
}

/**
 * Der Arbeitsordner ist der Projektpfad — die CLI läuft mit `--dangerously-skip-permissions`,
 * kann also überallhin schreiben. Ohne diese Ansage legt ein Agent im Zweifel ein eigenes
 * Repository an, statt das vorhandene zu ändern. Steht hier und nicht in den Prompt-Bausteinen,
 * weil jeder Lauf — Chat wie Vorhaben — durch diesen Runner geht.
 */
/**
 * Der einzige Satz, den die Spracheinstellung im Prompt bekommt. Die Anweisungen selbst
 * bleiben deutsch: sie sind abgestimmt, Claude versteht alle drei Sprachen, und eine
 * Übersetzung würde erprobtes Verhalten ohne Not verändern.
 */
function languageRule(): string {
  const name = LANGUAGE_NAMES_DE[getLanguage()]
  return [
    '## Sprache',
    `Antworte auf ${name} und schreibe auch Ticket-Kommentare, Dokumente und Erinnerungen auf ${name} —`,
    'unabhängig davon, in welcher Sprache dieser Prompt verfasst ist.',
  ].join('\n')
}

/**
 * Die Zurückhaltungsregel. Sie steht hier und nicht in den Prompt-Bausteinen, weil jeder Lauf
 * durch diesen Runner geht — auch ein fortgesetzter, dessen Prompt nur noch frischen Kontext
 * enthält. Der Systemanhang geht bei jedem Lauf erneut raus, der Block kann also nie veralten.
 */
function restraintRule(): string {
  return buildRestraintBlock(getSettings().agentsMayWriteTests)
}

function workspaceRule(cwd: string): string {
  return [
    '## Arbeitsordner',
    `Du arbeitest in \`${cwd}\`. Das ist ein vorhandenes lokales Repository und dein aktuelles`,
    'Verzeichnis — alle relativen Pfade beziehen sich darauf.',
    '',
    'Ändere die Dateien direkt dort. Lege kein neues Repository an (`git init`), klone nichts,',
    'kopiere das Projekt nicht an eine andere Stelle und arbeite nicht außerhalb dieses Ordners.',
    'Fehlt etwas, das du brauchst, sag es — leg es nicht daneben neu an.',
  ].join('\n')
}

function tail(text: string, limit = 600): string {
  const trimmed = text.trim()
  return trimmed.length > limit ? `…${trimmed.slice(-limit)}` : trimmed
}

/**
 * Startet einen Claude-Lauf. Der Handle liefert Events während des Laufs und ein Promise
 * mit dem Endergebnis; jeder Aufruf der App — Chat wie Goal-Loop — geht hier durch.
 */
export function run(request: RunRequest): RunHandle {
  const id = randomUUID()
  const scopeKey = buildScopeKey(request.scope)
  const events = new RunEmitter()
  const startedAt = Date.now()

  let child: ChildProcessWithoutNullStreams | null = null
  let aborted = false
  let idleTimedOut = false
  let finished = false
  let killTimer: NodeJS.Timeout | null = null

  const abort = (): void => {
    if (aborted || finished) return
    aborted = true
    log.info('Lauf abgebrochen', { id, scopeKey })
    if (!child) return
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child?.kill('SIGKILL'), KILL_GRACE_MS)
  }

  const done = start()

  return { id, scopeKey, events, abort, done }

  async function start(): Promise<RunResult> {
    let owned = false
    try {
      assertUsableCwd(request.cwd)
      const binary = await resolveClaudeBinary()
      // Vor jedem Lauf neu aus der Datenbank — so kann der Ordner nie veralten.
      const pluginDir = prepareSkillDirectory(request.scope.agentId, request.skills ?? [])

      const session = acquire(scopeKey, request.cwd)
      owned = session.owned

      // Zwischen `acquire` und dem Spawn kann `abort()` schon gelaufen sein.
      if (aborted) {
        return { text: '', thinking: '', sessionId: null, turnCount: session.turnCount, aborted: true, durationMs: 0 }
      }

      return await execute(binary, session.resumeId, session.turnCount, owned, pluginDir)
    } finally {
      finished = true
      if (killTimer) clearTimeout(killTimer)
      activeRuns.delete(id)
      release(scopeKey, owned)
    }
  }

  function execute(
    binary: string,
    resumeId: string | null,
    priorTurnCount: number,
    owned: boolean,
    pluginDir: string | null,
  ): Promise<RunResult> {
    const args = buildClaudeArgs({
      model: request.model,
      effort: request.effort,
      resumeId,
      // Die Reihenfolge ist Absicht: der Zurückhaltungsblock steht vor allem, was der
      // Aufrufer mitbringt — also vor der Werkzeugliste und vor dem Rollenhinweis, der ihn
      // für diesen Lauf punktuell aufhebt.
      systemPromptAppend: [
        workspaceRule(request.cwd),
        languageRule(),
        restraintRule(),
        request.systemPromptAppend,
      ]
        .filter((part): part is string => Boolean(part?.trim()))
        .join('\n\n'),
      mcp: request.mcp,
      pluginDir,
    })

    log.info('Lauf gestartet', {
      id,
      scopeKey,
      label: request.label ?? null,
      model: request.model,
      cwd: request.cwd,
      resume: resumeId,
      mcp: Boolean(request.mcp),
      pluginDir,
      skills: (request.skills ?? []).map((skill) => skill.slug),
    })

    return new Promise<RunResult>((resolve, reject) => {
      const parser = new StreamParser()
      let stderrBuffer = ''
      let streamError: StreamFailure | null = null
      let settled = false
      let idleTimer: NodeJS.Timeout | null = null

      const clearIdle = (): void => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = null
      }

      const touch = (): void => {
        clearIdle()
        idleTimer = setTimeout(() => {
          idleTimedOut = true
          log.warn('Lauf ohne Antwort abgebrochen', { id, scopeKey })
          child?.kill('SIGKILL')
        }, IDLE_TIMEOUT_MS)
      }

      const settle = (finish: () => void): void => {
        if (settled) return
        settled = true
        clearIdle()
        finish()
      }

      const fail = (error: Error): void => {
        settle(() => {
          events.emit('error', error)
          reject(error)
        })
      }

      const succeed = (result: RunResult): void => {
        settle(() => {
          events.emit('done', result)
          resolve(result)
        })
      }

      let proc: ChildProcessWithoutNullStreams
      try {
        proc = spawn(binary, args, {
          cwd: request.cwd,
          env: claudeEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams
      } catch (error) {
        fail(
          new RunError(
            'cli_unavailable',
            mainT()('main.error.cliStartFailed', {
              reason: String(describeError(error).message),
            }),
          ),
        )
        return
      }
      child = proc

      activeRuns.set(id, {
        info: {
          id,
          scopeKey,
          scope: request.scope,
          label: request.label ?? null,
          model: request.model,
          cwd: request.cwd,
          startedAt,
        },
        abort,
      })

      const handleEvents = (parsed: ReturnType<StreamParser['push']>): void => {
        for (const event of parsed) {
          switch (event.type) {
            case 'text':
              events.emit('text', event.text)
              break
            case 'thinking':
              events.emit('thinking', event.thinking)
              break
            case 'toolStart':
              events.emit('toolStart', { name: event.name })
              break
            case 'toolEnd':
              events.emit('toolEnd', { name: event.name })
              break
            case 'sessionId':
              events.emit('sessionId', event.sessionId)
              break
            case 'result':
              events.emit('text', event.text)
              break
            case 'error':
              streamError = { message: event.message, rateLimit: event.rateLimit }
              break
          }
        }
      }

      touch()

      proc.stdout.setEncoding('utf8')
      proc.stdout.on('data', (chunk: string) => {
        touch()
        handleEvents(parser.push(chunk))
      })

      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        touch()
        stderrBuffer += chunk
        if (stderrBuffer.length > STDERR_LIMIT) {
          stderrBuffer = stderrBuffer.slice(-STDERR_LIMIT)
        }
      })

      proc.on('error', (error) => {
        fail(
          new RunError(
            'cli_unavailable',
            mainT()('main.error.cliStartFailed', { reason: error.message }),
          ),
        )
      })

      proc.on('close', (code) => {
        handleEvents(parser.flush())

        const text = parser.text
        const thinking = parser.thinking
        const sessionId = parser.sessionId
        const durationMs = Date.now() - startedAt

        if (aborted) {
          succeed({ text, thinking, sessionId, turnCount: priorTurnCount, aborted: true, durationMs })
          return
        }

        if (idleTimedOut) {
          if (text.trim()) {
            log.warn('Lauf nach Zeitüberschreitung mit Teiltext beendet', { id, scopeKey })
            succeed({
              text,
              thinking,
              sessionId,
              turnCount: persistTurn(sessionId, owned, priorTurnCount),
              aborted: false,
              durationMs,
            })
          } else {
            fail(new RunError('timeout', mainT()('main.error.claudeTimeout')))
          }
          return
        }

        if (code !== 0) {
          fail(buildFailure(code, stderrBuffer, streamError, owned, text))
          return
        }

        succeed({
          text,
          thinking,
          sessionId,
          turnCount: persistTurn(sessionId, owned, priorTurnCount),
          aborted: false,
          durationMs,
        })
      })

      proc.stdin.on('error', () => {
        // Bricht die CLI sofort ab, ist die Pipe zu — der Exit-Code erklärt den Fehler besser.
      })
      proc.stdin.end(request.prompt)
    })
  }

  function persistTurn(sessionId: string | null, owned: boolean, priorTurnCount: number): number {
    try {
      const turnCount = persist(scopeKey, sessionId, request.cwd, owned)
      return turnCount || priorTurnCount
    } catch (error) {
      log.warn('Session konnte nicht gespeichert werden', describeError(error))
      return priorTurnCount
    }
  }

  /**
   * Rate-Limits werden ausschließlich hier ausgewertet — also nur bei Exit-Code ≠ 0 und nie
   * im Antworttext. Sonst löst ein Agent, der über Rate-Limits schreibt, einen Fehlalarm aus.
   */
  function buildFailure(
    code: number | null,
    stderr: string,
    streamError: StreamFailure | null,
    owned: boolean,
    partialText: string,
  ): Error {
    const message = streamError?.message ?? ''
    const combined = `${message}\n${stderr}`.trim()

    const rateLimit = streamError?.rateLimit ?? detectRateLimit(combined)
    if (rateLimit) {
      log.warn('Rate-Limit erkannt', { id, scopeKey, retryAfterMs: rateLimit.retryAfterMs })
      return new RateLimitError(
        mainT()('main.error.rateLimit', { seconds: Math.round(rateLimit.retryAfterMs / 1000) }),
        rateLimit.retryAfterMs,
      )
    }

    if (discardOnResumeFailure(scopeKey, owned, combined)) {
      return new RunError('session_lost', mainT()('main.error.sessionLost'))
    }

    const detail = tail(combined) || (partialText.trim() ? tail(partialText) : '')
    log.error('Lauf fehlgeschlagen', { id, scopeKey, code, detail })
    return new RunError(
      'process_failed',
      detail
        ? mainT()('main.error.exitWithDetail', { code: code ?? '?', detail })
        : mainT()('main.error.exitWithoutResult', { code: code ?? '?' }),
    )
  }
}

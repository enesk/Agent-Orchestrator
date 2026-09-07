/**
 * Normalisiert den `--output-format stream-json`-Strom der Claude-CLI.
 *
 * Der Parser ist bewusst nachsichtig: das Format der CLI ändert sich zwischen Versionen,
 * darum werden unbekannte Events und kaputte Zeilen stillschweigend übersprungen statt
 * einen Lauf abzubrechen. Er ist rein — keine Prozesse, keine Datenbank, kein Logger —
 * damit er sich isoliert durchspielen lässt.
 */

export type StreamEvent =
  | { type: 'sessionId'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolStart'; name: string }
  | { type: 'toolEnd'; name: string | null }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string; rateLimit: RateLimitHint | null }

export interface RateLimitHint {
  retryAfterMs: number
}

const DEFAULT_RETRY_AFTER_MS = 60_000

const RATE_LIMIT_PATTERNS = [
  /rate[\s_-]?limit/i,
  /\b429\b/,
  /too many requests/i,
  /over quota/i,
  /resource[\s_-]?exhausted/i,
]

const RESUME_FAILURE_PATTERNS = [
  /session\b[^.\n]*\b(not found|does not exist|expired|invalid)/i,
  /could not resume/i,
  /no conversation found/i,
  /unable to resume/i,
]

/** Erkennt eine Rate-Limit-Meldung und liest die Wartezeit heraus, wenn sie dabeisteht. */
export function detectRateLimit(text: string): RateLimitHint | null {
  if (!text) return null
  if (!RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(text))) return null
  return { retryAfterMs: parseRetryAfterMs(text) ?? DEFAULT_RETRY_AFTER_MS }
}

function parseRetryAfterMs(text: string): number | null {
  const header = /retry[\s_-]?after["'\s:]+(\d+(?:\.\d+)?)/i.exec(text)
  if (header) return Math.round(Number(header[1]) * 1000)

  const seconds = /(\d+(?:\.\d+)?)\s*seconds?/i.exec(text)
  if (seconds) return Math.round(Number(seconds[1]) * 1000)

  const minutes = /(\d+(?:\.\d+)?)\s*minutes?/i.exec(text)
  if (minutes) return Math.round(Number(minutes[1]) * 60_000)

  return null
}

/** Sieht der Fehler danach aus, dass ein `--resume` ins Leere lief? */
export function looksLikeResumeFailure(text: string): boolean {
  if (!text) return false
  return RESUME_FAILURE_PATTERNS.some((pattern) => pattern.test(text))
}

interface JsonRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export class StreamParser {
  /** Unvollständige letzte Zeile eines Chunks. */
  private buffer = ''

  /** Text abgeschlossener Assistant-Nachrichten — Deltas ersetzen nur den aktuellen Rest. */
  private committedText = ''
  private committedThinking = ''
  private currentText = ''
  private currentThinking = ''
  private currentMessageId: string | null = null

  /** Blockindex → Werkzeugname, um `content_block_stop` einem Tool zuordnen zu können. */
  private toolBlocks = new Map<number, string>()
  /** Bereits gemeldete Tool-Aufrufe (die CLI meldet sie doppelt: Stream und Assistant-Event). */
  private announcedTools = new Set<string>()
  private lastSessionId: string | null = null

  get sessionId(): string | null {
    return this.lastSessionId
  }

  get text(): string {
    return this.committedText + this.currentText
  }

  get thinking(): string {
    return this.committedThinking + this.currentThinking
  }

  /** Nimmt einen Chunk entgegen und liefert die daraus entstandenen Events. */
  push(chunk: string): StreamEvent[] {
    this.buffer += chunk
    const events: StreamEvent[] = []

    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      this.consumeLine(line, events)
      newline = this.buffer.indexOf('\n')
    }

    return events
  }

  /** Verarbeitet einen eventuell offenen Rest, wenn der Prozess beendet ist. */
  flush(): StreamEvent[] {
    const events: StreamEvent[] = []
    if (this.buffer.trim()) this.consumeLine(this.buffer, events)
    this.buffer = ''
    return events
  }

  private consumeLine(line: string, events: StreamEvent[]): void {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('{')) return

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return
    }
    if (!isRecord(parsed)) return

    this.captureSessionId(parsed, events)

    switch (parsed.type) {
      case 'assistant':
        this.handleAssistant(parsed, events)
        break
      case 'user':
        this.handleUser(parsed, events)
        break
      case 'stream_event':
        this.handleStreamEvent(isRecord(parsed.event) ? parsed.event : parsed, events)
        break
      case 'result':
        this.handleResult(parsed, events)
        break
      case 'error':
        events.push(this.errorEvent(this.describeError(parsed)))
        break
      default:
        // Auch `system`-Events und unbekannte Typen können eine Session-ID tragen; die
        // ist oben schon eingesammelt, mehr brauchen wir nicht.
        if (isRecord(parsed.event)) this.handleStreamEvent(parsed.event, events)
        break
    }
  }

  private captureSessionId(record: JsonRecord, events: StreamEvent[]): void {
    const sessionId =
      asString(record.session_id) ??
      asString(record.sessionId) ??
      (isRecord(record.message) ? asString(record.message.session_id) : null)
    if (!sessionId || sessionId === this.lastSessionId) return
    this.lastSessionId = sessionId
    events.push({ type: 'sessionId', sessionId })
  }

  /**
   * Eine neue Assistant-Nachricht beginnt: was bisher da ist, wird festgeschrieben, damit
   * die folgenden Ersetzungen nicht den Text vor einem Werkzeugaufruf verschlucken.
   */
  private switchMessage(messageId: string | null): void {
    if (messageId !== null && messageId === this.currentMessageId) return
    if (this.currentMessageId !== null) {
      this.committedText += this.currentText
      this.committedThinking += this.currentThinking
    }
    this.currentText = ''
    this.currentThinking = ''
    this.currentMessageId = messageId
  }

  private handleAssistant(record: JsonRecord, events: StreamEvent[]): void {
    const message = isRecord(record.message) ? record.message : null
    if (!message) return

    this.switchMessage(asString(message.id))

    let text = ''
    let thinking = ''

    for (const raw of asArray(message.content)) {
      if (!isRecord(raw)) continue
      switch (raw.type) {
        case 'text':
          text += asString(raw.text) ?? ''
          break
        case 'thinking':
        case 'redacted_thinking':
          thinking += asString(raw.thinking) ?? ''
          break
        case 'tool_use':
        case 'server_tool_use':
        case 'mcp_tool_use': {
          const name = asString(raw.name) ?? 'Werkzeug'
          const key = asString(raw.id) ?? `${this.currentMessageId ?? ''}:${name}`
          if (!this.announcedTools.has(key)) {
            this.announcedTools.add(key)
            events.push({ type: 'toolStart', name })
          }
          break
        }
        default:
          break
      }
    }

    // Jedes Assistant-Event trägt den vollständigen Inhalt seiner Nachricht — ersetzen,
    // nicht anhängen.
    if (text !== this.currentText) {
      this.currentText = text
      events.push({ type: 'text', text: this.text })
    }
    if (thinking !== this.currentThinking) {
      this.currentThinking = thinking
      events.push({ type: 'thinking', thinking: this.thinking })
    }
  }

  private handleUser(record: JsonRecord, events: StreamEvent[]): void {
    const message = isRecord(record.message) ? record.message : null
    if (!message) return
    for (const raw of asArray(message.content)) {
      if (!isRecord(raw)) continue
      if (raw.type === 'tool_result' || raw.type === 'mcp_tool_result') {
        events.push({ type: 'toolEnd', name: null })
      }
    }
  }

  private handleStreamEvent(event: JsonRecord, events: StreamEvent[]): void {
    switch (event.type) {
      case 'message_start': {
        const message = isRecord(event.message) ? event.message : null
        this.switchMessage(message ? asString(message.id) : null)
        break
      }
      case 'content_block_start': {
        const index = typeof event.index === 'number' ? event.index : -1
        const block = isRecord(event.content_block) ? event.content_block : null
        if (!block) break
        if (block.type === 'tool_use' || block.type === 'mcp_tool_use') {
          const name = asString(block.name) ?? 'Werkzeug'
          if (index >= 0) this.toolBlocks.set(index, name)
          const key = asString(block.id) ?? `${this.currentMessageId ?? ''}:${index}`
          if (!this.announcedTools.has(key)) {
            this.announcedTools.add(key)
            events.push({ type: 'toolStart', name })
          }
        }
        break
      }
      case 'content_block_delta': {
        const delta = isRecord(event.delta) ? event.delta : null
        if (!delta) break
        if (delta.type === 'text_delta') {
          this.currentText += asString(delta.text) ?? ''
          events.push({ type: 'text', text: this.text })
        } else if (delta.type === 'thinking_delta') {
          this.currentThinking += asString(delta.thinking) ?? ''
          events.push({ type: 'thinking', thinking: this.thinking })
        }
        break
      }
      case 'content_block_stop': {
        const index = typeof event.index === 'number' ? event.index : -1
        const name = index >= 0 ? this.toolBlocks.get(index) : undefined
        if (name) {
          this.toolBlocks.delete(index)
          events.push({ type: 'toolEnd', name })
        }
        break
      }
      case 'error':
        events.push(this.errorEvent(this.describeError(event)))
        break
      default:
        break
    }
  }

  private handleResult(record: JsonRecord, events: StreamEvent[]): void {
    const text = asString(record.result) ?? asString(record.text)
    const isError =
      record.is_error === true || (typeof record.subtype === 'string' && record.subtype.startsWith('error'))

    if (isError) {
      events.push(this.errorEvent(text ?? this.describeError(record)))
      return
    }

    if (text) {
      // Das Ergebnis ist die Wahrheit über den gesamten Lauf.
      this.committedText = text
      this.currentText = ''
      this.currentMessageId = null
      events.push({ type: 'result', text })
    } else {
      events.push({ type: 'result', text: this.text })
    }
  }

  private describeError(record: JsonRecord): string {
    const direct = asString(record.message) ?? asString(record.error)
    if (direct) return direct
    if (isRecord(record.error)) {
      const nested = asString(record.error.message) ?? asString(record.error.type)
      if (nested) return nested
    }
    return JSON.stringify(record).slice(0, 500)
  }

  private errorEvent(message: string): StreamEvent {
    return { type: 'error', message, rateLimit: detectRateLimit(message) }
  }
}

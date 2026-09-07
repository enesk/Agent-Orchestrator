import { randomUUID } from 'node:crypto'
import { emitEvent } from './ipc/events'
import type { JsonObject, LogEntry, LogLevel } from '@shared/types'

const MAX_ENTRIES = 500

const buffer: LogEntry[] = []

function push(level: LogLevel, scope: string, message: string, data?: JsonObject): void {
  const entry: LogEntry = {
    id: randomUUID(),
    level,
    scope,
    message,
    data: data ?? null,
    timestamp: new Date().toISOString(),
  }

  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES)

  const line = `[${entry.level}] ${entry.scope}: ${entry.message}`
  if (level === 'error') console.error(line, data ?? '')
  else if (level === 'warn') console.warn(line, data ?? '')
  else console.log(line, data ?? '')

  emitEvent('log.entry', entry)
}

/** Reduziert einen unbekannten Fehler auf etwas, das als JSON durch den IPC passt. */
export function describeError(error: unknown): JsonObject {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null }
  }
  return { message: String(error) }
}

export const logger = {
  debug: (scope: string, message: string, data?: JsonObject) => push('debug', scope, message, data),
  info: (scope: string, message: string, data?: JsonObject) => push('info', scope, message, data),
  warn: (scope: string, message: string, data?: JsonObject) => push('warn', scope, message, data),
  error: (scope: string, message: string, data?: JsonObject) => push('error', scope, message, data),
  recent: (limit = MAX_ENTRIES): LogEntry[] => buffer.slice(-limit),
  clear: (): void => {
    buffer.length = 0
  },
}

/** Namensraum-gebundener Logger, damit Aufrufer den Scope nicht wiederholen müssen. */
export function scopedLogger(scope: string) {
  return {
    debug: (message: string, data?: JsonObject) => logger.debug(scope, message, data),
    info: (message: string, data?: JsonObject) => logger.info(scope, message, data),
    warn: (message: string, data?: JsonObject) => logger.warn(scope, message, data),
    error: (message: string, data?: JsonObject) => logger.error(scope, message, data),
  }
}

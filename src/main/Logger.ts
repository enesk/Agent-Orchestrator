import winston from 'winston'
import path from 'path'
import { app } from 'electron'
import { LogEntry } from '@shared/types'
import { MAX_LOG_ENTRIES } from '@shared/constants'
import { randomUUID } from 'crypto'

const logDir = path.join(app.getPath('userData'), 'logs')

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
})

const logBuffer: LogEntry[] = []
let onLogCallback: ((entry: LogEntry) => void) | null = null

function addLogEntry(level: LogEntry['level'], message: string, sessionId?: string): void {
  const entry: LogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message,
    sessionId,
  }

  logBuffer.push(entry)
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift()
  }

  onLogCallback?.(entry)
}

export function setLogCallback(cb: (entry: LogEntry) => void): void {
  onLogCallback = cb
}

export function getLogEntries(): LogEntry[] {
  return [...logBuffer]
}

export function log(level: LogEntry['level'], message: string, sessionId?: string): void {
  logger.log(level, message, { sessionId })
  addLogEntry(level, message, sessionId)
}

export default logger

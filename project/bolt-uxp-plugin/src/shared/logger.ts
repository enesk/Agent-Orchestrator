/**
 * Prefix-basiertes Logger-Modul (FA-11).
 * Nutzbar sowohl im Webview (React UI) als auch im Plugin-Backend.
 *
 * Verwendung:
 *   import { log } from '@shared/logger';
 *   log("Sync", "Offset berechnet:", 1.234);
 *   // → [Sync] Offset berechnet: 1.234
 *
 *   log.warn("Bridge", "Timeout nach", 10000, "ms");
 *   // → [Bridge] Timeout nach 10000 ms
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const CONSOLE_METHODS: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.log,
  warn: console.warn,
  error: console.error,
};

function formatArgs(prefix: string, args: unknown[]): unknown[] {
  return [`[${prefix}]`, ...args];
}

function logAtLevel(level: LogLevel, prefix: string, ...args: unknown[]): void {
  CONSOLE_METHODS[level](...formatArgs(prefix, args));
}

/**
 * Standard-Log (info-Level).
 * log("Sync", "Offset berechnet:", offset) → [Sync] Offset berechnet: 1.234
 */
export function log(prefix: string, ...args: unknown[]): void {
  logAtLevel('info', prefix, ...args);
}

/** Debug-Level: nur für Entwicklungs-Details. */
log.debug = (prefix: string, ...args: unknown[]): void => {
  logAtLevel('debug', prefix, ...args);
};

/** Warn-Level: unerwartete aber nicht-kritische Zustände. */
log.warn = (prefix: string, ...args: unknown[]): void => {
  logAtLevel('warn', prefix, ...args);
};

/** Error-Level: Fehler die behandelt werden müssen. */
log.error = (prefix: string, ...args: unknown[]): void => {
  logAtLevel('error', prefix, ...args);
};

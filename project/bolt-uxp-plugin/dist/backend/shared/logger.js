"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
const CONSOLE_METHODS = {
    debug: console.debug,
    info: console.log,
    warn: console.warn,
    error: console.error,
};
function formatArgs(prefix, args) {
    return [`[${prefix}]`, ...args];
}
function logAtLevel(level, prefix, ...args) {
    CONSOLE_METHODS[level](...formatArgs(prefix, args));
}
/**
 * Standard-Log (info-Level).
 * log("Sync", "Offset berechnet:", offset) → [Sync] Offset berechnet: 1.234
 */
function log(prefix, ...args) {
    logAtLevel('info', prefix, ...args);
}
/** Debug-Level: nur für Entwicklungs-Details. */
log.debug = (prefix, ...args) => {
    logAtLevel('debug', prefix, ...args);
};
/** Warn-Level: unerwartete aber nicht-kritische Zustände. */
log.warn = (prefix, ...args) => {
    logAtLevel('warn', prefix, ...args);
};
/** Error-Level: Fehler die behandelt werden müssen. */
log.error = (prefix, ...args) => {
    logAtLevel('error', prefix, ...args);
};

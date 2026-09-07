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
/**
 * Standard-Log (info-Level).
 * log("Sync", "Offset berechnet:", offset) → [Sync] Offset berechnet: 1.234
 */
export declare function log(prefix: string, ...args: unknown[]): void;
export declare namespace log {
    var debug: (prefix: string, ...args: unknown[]) => void;
    var warn: (prefix: string, ...args: unknown[]) => void;
    var error: (prefix: string, ...args: unknown[]) => void;
}

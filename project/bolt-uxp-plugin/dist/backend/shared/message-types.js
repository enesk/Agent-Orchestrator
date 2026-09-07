"use strict";
/**
 * Shared Message Types für die Bolt UXP Messaging-Schicht.
 * Definiert alle Request/Response-Interfaces zwischen Webview und Plugin-Backend.
 *
 * WICHTIG: Diese Datei wird sowohl vom Webview (ESNext) als auch vom Backend (CommonJS)
 * importiert. Keine Runtime-Dependencies verwenden — nur Types und Interfaces.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MESSAGE_TIMEOUTS = void 0;
// ── Timeout-Konfiguration pro Message-Typ ──
exports.MESSAGE_TIMEOUTS = {
    ping: 3000,
    getSequences: 10000,
    getClipsFromSequence: 10000,
    getMediaFilePath: 5000,
    getClipPositions: 5000,
    moveClip: 15000,
    syncClips: 30000,
};

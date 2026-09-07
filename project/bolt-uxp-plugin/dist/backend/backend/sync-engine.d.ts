/**
 * Sync-Engine Backend-Logik (FA-07 / #12)
 *
 * Kernlogik der Audio-Synchronisation:
 * 1. POST /sync an lokalen Server → Audio-Offset
 * 2. Offset-Berechnung inkl. Timeline-Korrektur
 * 3. Tick-Konvertierung (TICKS_PER_SECOND = 254016000000)
 * 4. Clip-Verschiebung mit 3 Fallback-Strategien
 *
 * Alle Premiere-API-Calls sind async, defensiv gegen null/undefined,
 * und in Transaktionen/Undo-Gruppen gekapselt.
 */
import type { SyncClipsParams, SyncClipsResult } from '../shared/message-types';
/**
 * Vollständiger Sync-Workflow:
 * 1. Sequenz + Clips aus Premiere API laden
 * 2. Media-Paths extrahieren
 * 3. POST /sync an Server
 * 4. Offset berechnen: totalMoveSec = audioOffset + (refStart - refInPoint) - (targetStart - targetInPoint)
 * 5. In Ticks konvertieren
 * 6. Ziel-Clip verschieben
 */
export declare function handleSyncClips(payload: SyncClipsParams): Promise<SyncClipsResult>;

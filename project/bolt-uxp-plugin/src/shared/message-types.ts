/**
 * Shared Message Types für die Bolt UXP Messaging-Schicht.
 * Definiert alle Request/Response-Interfaces zwischen Webview und Plugin-Backend.
 *
 * WICHTIG: Diese Datei wird sowohl vom Webview (ESNext) als auch vom Backend (CommonJS)
 * importiert. Keine Runtime-Dependencies verwenden — nur Types und Interfaces.
 */

// ── Clip & Sequenz Datenstrukturen ──

export interface SequenceInfo {
  id: string;
  name: string;
  videoTrackCount: number;
  audioTrackCount: number;
}

export interface ClipInfo {
  id: string;
  name: string;
  trackIndex: number;
  trackType: 'video' | 'audio';
  startTicks: string;
  endTicks: string;
  inPointTicks: string;
  outPointTicks: string;
  mediaPath?: string;
}

export interface ClipPosition {
  clipId: string;
  name: string;
  trackType: 'video' | 'audio';
  trackIndex: number;
  startTicks: string;
  endTicks: string;
  inPointTicks: string;
  outPointTicks: string;
}

export interface MoveClipParams {
  sequenceId: string;
  clipName: string;
  offsetTicks: string;
}

export interface MoveClipResult {
  moved: boolean;
  tracksAffected: number;
  strategy: 'createMoveAction' | 'createSetStartAction' | 'direct';
  error?: string;
}

// ── Sync-Engine Datenstrukturen ──

export interface SyncClipsParams {
  sequenceId: string;
  referenceClipName: string;
  targetClipName: string;
}

export interface SyncClipsResult {
  success: boolean;
  /** Audio-Offset vom Server in Sekunden */
  audioOffset: number;
  /** Gesamt-Verschiebung in Sekunden (inkl. Timeline-Korrektur) */
  totalMoveSec: number;
  /** Gesamt-Verschiebung in Ticks */
  totalMoveTicks: string;
  /** Konfidenz des Audio-Matchings (0-1) */
  confidence: number;
  /** Anzahl verschobener TrackItems */
  tracksAffected: number;
  /** Verwendete Verschiebungs-Strategie */
  moveStrategy: 'createMoveAction' | 'createSetStartAction' | 'direct';
  /** Verwendete TickTime-Strategie */
  tickTimeStrategy: 'createWithSeconds' | 'createWithTicks' | 'constructor' | 'plainObject';
  /** Fehlermeldung wenn nicht erfolgreich */
  error?: string;
  /** Teilweiser Erfolg: Offset berechnet, aber Clip nicht verschoben */
  partial?: boolean;
}

// ── Message-Typ-Definitionen ──

/**
 * Alle unterstützten Message-Typen mit ihren Payload- und Response-Typen.
 */
export interface MessageTypeMap {
  ping: { payload: void; response: { status: string } };
  getSequences: { payload: void; response: SequenceInfo[] };
  getClipsFromSequence: { payload: { sequenceId: string }; response: ClipInfo[] };
  getMediaFilePath: { payload: { sequenceId: string; clipName: string }; response: { path: string | null } };
  getClipPositions: { payload: { sequenceId: string; clipName: string }; response: ClipPosition[] };
  moveClip: { payload: MoveClipParams; response: MoveClipResult };
  syncClips: { payload: SyncClipsParams; response: SyncClipsResult };
}

export type MessageType = keyof MessageTypeMap;

// ── Bridge Request / Response ──

export interface BridgeRequest<T extends MessageType = MessageType> {
  id: string;
  type: T;
  payload: MessageTypeMap[T]['payload'];
}

export interface BridgeResponse<T extends MessageType = MessageType> {
  id: string;
  success: boolean;
  data?: MessageTypeMap[T]['response'];
  error?: string;
}

// ── Timeout-Konfiguration pro Message-Typ ──

export const MESSAGE_TIMEOUTS: Record<MessageType, number> = {
  ping: 3000,
  getSequences: 10000,
  getClipsFromSequence: 10000,
  getMediaFilePath: 5000,
  getClipPositions: 5000,
  moveClip: 15000,
  syncClips: 30000,
};

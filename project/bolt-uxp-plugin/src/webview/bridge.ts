/**
 * Webview Bridge — Promise-basierte Kommunikation mit dem Plugin-Backend.
 *
 * Jeder Aufruf erzeugt eine eindeutige Message-ID, sendet die Nachricht via
 * postMessage an das Backend und wartet auf die zugehörige Response.
 * Bei Timeout wird das Promise rejected.
 *
 * Keine direkte Premiere-API-Nutzung — alles läuft über Messages.
 */

import type {
  MessageType,
  MessageTypeMap,
  BridgeRequest,
  BridgeResponse,
} from '../shared/message-types';
import { MESSAGE_TIMEOUTS } from '../shared/message-types';

// ── Pending-Request-Tracking ──

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

let messageCounter = 0;

function generateId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

// ── Message Listener (einmalig registrieren) ──

let listenerRegistered = false;

function ensureListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as BridgeResponse | undefined;
    if (!data || typeof data.id !== 'string') return;

    const pending = pendingRequests.get(data.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(data.id);

    if (data.success) {
      pending.resolve(data.data);
    } else {
      pending.reject(new Error(data.error ?? 'Unbekannter Backend-Fehler'));
    }
  });
}

// ── Generische Send-Funktion ──

function sendMessage<T extends MessageType>(
  type: T,
  payload: MessageTypeMap[T]['payload']
): Promise<MessageTypeMap[T]['response']> {
  ensureListener();

  const id = generateId();
  const timeout = MESSAGE_TIMEOUTS[type];

  const request: BridgeRequest<T> = { id, type, payload };

  return new Promise<MessageTypeMap[T]['response']>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout nach ${timeout}ms für Message "${type}"`));
    }, timeout);

    pendingRequests.set(id, {
      resolve: resolve as (data: unknown) => void,
      reject,
      timer,
    });

    // Bolt UXP Webview → Backend postMessage
    // In Bolt UXP sendet das Webview über window.postMessage oder
    // den von Bolt bereitgestellten Mechanismus
    window.postMessage(request, '*');
  });
}

// ── Typsichere API-Funktionen ──

/**
 * Lädt alle Sequenzen aus dem aktiven Premiere-Pro-Projekt.
 */
export function getSequences() {
  return sendMessage('getSequences', undefined as void);
}

/**
 * Lädt alle Clips (Video + Audio) einer bestimmten Sequenz.
 */
export function getClipsFromSequence(sequenceId: string) {
  return sendMessage('getClipsFromSequence', { sequenceId });
}

/**
 * Extrahiert den Media-Dateipfad eines Clips.
 */
export function getMediaFilePath(sequenceId: string, clipName: string) {
  return sendMessage('getMediaFilePath', { sequenceId, clipName });
}

/**
 * Liest die Timeline-Positionen aller TrackItems eines Clips.
 */
export function getClipPositions(sequenceId: string, clipName: string) {
  return sendMessage('getClipPositions', { sequenceId, clipName });
}

/**
 * Verschiebt einen Clip um den angegebenen Offset (in Ticks).
 * Nutzt im Backend Transaction/Undo via lockedAccess + executeTransaction.
 */
export function moveClip(sequenceId: string, clipName: string, offsetTicks: string) {
  return sendMessage('moveClip', { sequenceId, clipName, offsetTicks });
}

/**
 * Startet den vollständigen Sync-Workflow:
 * 1. Media-Paths aus Premiere extrahieren
 * 2. POST /sync an lokalen Server
 * 3. Offset berechnen (inkl. Timeline-Korrektur)
 * 4. Ziel-Clip in der Timeline verschieben
 */
export function syncClips(sequenceId: string, referenceClipName: string, targetClipName: string) {
  return sendMessage('syncClips', { sequenceId, referenceClipName, targetClipName });
}

/**
 * Prüft ob die Verbindung zum Backend steht.
 */
export function ping() {
  return sendMessage('ping', undefined as void);
}

/**
 * Gibt die Anzahl der aktuell ausstehenden Requests zurück.
 * Nützlich für Debugging und Status-Anzeige.
 */
export function getPendingCount(): number {
  return pendingRequests.size;
}

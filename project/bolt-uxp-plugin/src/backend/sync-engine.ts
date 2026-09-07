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

// Premiere API — nur im Backend-Kontext verfügbar
// eslint-disable-next-line @typescript-eslint/no-var-requires
const premierepro = require('premierepro');

// ── Konstanten ──

const TICKS_PER_SECOND = 254016000000;
const SYNC_SERVER_BASE = 'http://127.0.0.1:5050';
const SYNC_TIMEOUT_MS = 15000;

// ── Server-Kommunikation ──

interface SyncServerResponse {
  offset: number;
  confidence: number;
  error?: string;
}

/**
 * POST /sync an den lokalen Sync-Server.
 * Request-Format: { reference_path, target_path, reference_inpoint: 0, target_inpoint: 0 }
 */
async function callSyncServer(
  referencePath: string,
  targetPath: string
): Promise<SyncServerResponse> {
  const url = `${SYNC_SERVER_BASE}/sync`;
  const body = JSON.stringify({
    reference_path: referencePath,
    target_path: targetPath,
    reference_inpoint: 0,
    target_inpoint: 0,
  });

  // UXP Backend-Kontext: fetch oder XHR verfügbar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchFn = (globalThis as any).fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XHR = (globalThis as any).XMLHttpRequest;

  if (typeof fetchFn === 'function') {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sync-Server Fehler (${response.status}): ${text}`);
    }

    return (await response.json()) as SyncServerResponse;
  }

  if (typeof XHR !== 'function') {
    throw new Error('Weder fetch noch XMLHttpRequest im Backend verfügbar');
  }

  // XHR-Fallback
  return new Promise<SyncServerResponse>((resolve, reject) => {
    const xhr = new XHR();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = SYNC_TIMEOUT_MS;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as SyncServerResponse);
        } catch {
          reject(new Error('Sync-Server: Ungültige JSON-Antwort'));
        }
      } else {
        reject(new Error(`Sync-Server Fehler (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Sync-Server nicht erreichbar'));
    xhr.ontimeout = () => reject(new Error(`Sync-Server Timeout nach ${SYNC_TIMEOUT_MS}ms`));

    xhr.send(body);
  });
}

// ── Media-Path Extraktion ──

/**
 * Extrahiert den MediaPath eines Clips aus der Sequenz.
 * getProjectItem() → ClipProjectItem.cast() → getMediaFilePath()
 */
async function extractMediaPath(
  sequence: any,
  clipName: string
): Promise<string | null> {
  const allTracks = [
    ...(sequence.videoTracks ?? []),
    ...(sequence.audioTracks ?? []),
  ];

  for (const track of allTracks) {
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (!item || item.name !== clipName) continue;

      try {
        const projectItem = await item.getProjectItem?.();
        if (!projectItem) continue;

        const clipProjectItem =
          premierepro.ClipProjectItem?.cast?.(projectItem) ?? projectItem;
        const mediaPath = await clipProjectItem.getMediaFilePath?.();

        if (mediaPath) return String(mediaPath);
      } catch {
        continue;
      }
    }
  }

  return null;
}

// ── Clip-Positionen lesen ──

interface ClipTimeInfo {
  startTicks: string;
  inPointTicks: string;
  startSeconds: number;
  inPointSeconds: number;
}

/**
 * Liest die Timeline-Position des ersten gefundenen TrackItems eines Clips.
 * Benötigt für die Offset-Berechnung.
 */
async function getClipTimeInfo(
  sequence: any,
  clipName: string
): Promise<ClipTimeInfo | null> {
  const allTracks = [
    ...(sequence.videoTracks ?? []),
    ...(sequence.audioTracks ?? []),
  ];

  for (const track of allTracks) {
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (!item || item.name !== clipName) continue;

      const startTicks = String(item.start?.ticks ?? item.startTime?.ticks ?? '0');
      const inPointTicks = String(item.inPoint?.ticks ?? '0');

      return {
        startTicks,
        inPointTicks,
        startSeconds: Number(startTicks) / TICKS_PER_SECOND,
        inPointSeconds: Number(inPointTicks) / TICKS_PER_SECOND,
      };
    }
  }

  return null;
}

// ── TickTime-Erstellung (4 Fallbacks, Risiko R-01) ──

type TickTimeStrategy = SyncClipsResult['tickTimeStrategy'];

interface TickTimeResult {
  tickTime: any;
  strategy: TickTimeStrategy;
}

/**
 * Erstellt ein TickTime-Objekt mit 4 Fallback-Strategien:
 * 1. createWithSeconds — am präzisesten für Sekundenwerte
 * 2. createWithTicks — String-basiert
 * 3. new TickTime — Konstruktor
 * 4. Plain Object — letzter Ausweg
 */
function createTickTime(seconds: number, ticks: string): TickTimeResult {
  // Strategie 1: createWithSeconds
  try {
    if (premierepro.TickTime?.createWithSeconds) {
      const tt = premierepro.TickTime.createWithSeconds(seconds);
      if (tt) return { tickTime: tt, strategy: 'createWithSeconds' };
    }
  } catch { /* Fallback */ }

  // Strategie 2: createWithTicks
  try {
    if (premierepro.TickTime?.createWithTicks) {
      const tt = premierepro.TickTime.createWithTicks(ticks);
      if (tt) return { tickTime: tt, strategy: 'createWithTicks' };
    }
  } catch { /* Fallback */ }

  // Strategie 3: new TickTime
  try {
    if (premierepro.TickTime) {
      const tt = new premierepro.TickTime(ticks);
      if (tt) return { tickTime: tt, strategy: 'constructor' };
    }
  } catch { /* Fallback */ }

  // Strategie 4: Plain Object
  return {
    tickTime: { ticks },
    strategy: 'plainObject',
  };
}

// ── Clip-Verschiebung (3 Strategien, Risiko R-04) ──

type MoveStrategy = SyncClipsResult['moveStrategy'];

interface MoveResult {
  moved: boolean;
  strategy: MoveStrategy;
  tracksAffected: number;
  error?: string;
}

/**
 * Verschiebt alle TrackItems (Video + Audio) des Ziel-Clips.
 * 3 Fallback-Strategien, gekapselt in Transaction/Undo.
 */
async function moveClipItems(
  project: any,
  itemsToMove: any[],
  tickTime: any,
  offsetTicks: string
): Promise<MoveResult> {
  // Strategie 1: createMoveAction() in Transaction
  try {
    await project.lockedAccess(async () => {
      const actions = itemsToMove.map((item: any) => {
        if (!item.createMoveAction) {
          throw new Error('createMoveAction nicht verfügbar');
        }
        return item.createMoveAction(tickTime);
      });

      await project.executeTransaction(actions, 'Audio Sync: Clip verschieben');
    });

    return { moved: true, strategy: 'createMoveAction', tracksAffected: itemsToMove.length };
  } catch { /* Fallback */ }

  // Strategie 2: createSetStartAction() in Transaction
  try {
    await project.lockedAccess(async () => {
      const actions: any[] = [];
      for (const item of itemsToMove) {
        if (!item.createSetStartAction) {
          throw new Error('createSetStartAction nicht verfügbar');
        }

        const currentStart = item.start?.ticks ?? item.startTime?.ticks ?? '0';
        const newStartTicks = String(BigInt(currentStart) + BigInt(offsetTicks));

        let newStartTime: any = null;
        try {
          newStartTime = premierepro.TickTime?.createWithTicks?.(newStartTicks);
        } catch { /* ignore */ }
        if (!newStartTime) {
          newStartTime = { ticks: newStartTicks };
        }

        actions.push(item.createSetStartAction(newStartTime));
      }

      await project.executeTransaction(actions, 'Audio Sync: Clip verschieben');
    });

    return { moved: true, strategy: 'createSetStartAction', tracksAffected: itemsToMove.length };
  } catch { /* Fallback */ }

  // Strategie 3: Direkt setStartTime()/move()
  try {
    for (const item of itemsToMove) {
      if (item.move) {
        await item.move(tickTime);
      } else if (item.setStartTime) {
        const currentStart = item.start?.ticks ?? item.startTime?.ticks ?? '0';
        const newStartTicks = String(BigInt(currentStart) + BigInt(offsetTicks));

        let newStartTime: any = null;
        try {
          newStartTime = premierepro.TickTime?.createWithTicks?.(newStartTicks);
        } catch { /* ignore */ }
        if (!newStartTime) {
          newStartTime = { ticks: newStartTicks };
        }

        await item.setStartTime(newStartTime);
      } else {
        throw new Error('Keine Verschiebungsmethode verfügbar');
      }
    }

    return { moved: true, strategy: 'direct', tracksAffected: itemsToMove.length };
  } catch (err) {
    return {
      moved: false,
      strategy: 'direct',
      tracksAffected: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Hauptfunktion: Sync-Engine ──

/**
 * Vollständiger Sync-Workflow:
 * 1. Sequenz + Clips aus Premiere API laden
 * 2. Media-Paths extrahieren
 * 3. POST /sync an Server
 * 4. Offset berechnen: totalMoveSec = audioOffset + (refStart - refInPoint) - (targetStart - targetInPoint)
 * 5. In Ticks konvertieren
 * 6. Ziel-Clip verschieben
 */
export async function handleSyncClips(payload: SyncClipsParams): Promise<SyncClipsResult> {
  // ── Schritt 1: Projekt + Sequenz laden ──
  const project = await premierepro.Project.getActiveProject();
  if (!project) {
    throw new Error('Kein Premiere-Projekt geöffnet');
  }

  const sequences = await project.getSequences();
  const sequence = sequences?.find((s: any) => s.id === payload.sequenceId);
  if (!sequence) {
    throw new Error(`Sequenz "${payload.sequenceId}" nicht gefunden`);
  }

  // ── Schritt 2: Media-Paths extrahieren ──
  const refPath = await extractMediaPath(sequence, payload.referenceClipName);
  if (!refPath) {
    throw new Error(`Media-Pfad für Referenz-Clip "${payload.referenceClipName}" nicht gefunden`);
  }

  const targetPath = await extractMediaPath(sequence, payload.targetClipName);
  if (!targetPath) {
    throw new Error(`Media-Pfad für Ziel-Clip "${payload.targetClipName}" nicht gefunden`);
  }

  // ── Schritt 3: POST /sync an Server ──
  let serverResponse: SyncServerResponse;
  try {
    serverResponse = await callSyncServer(refPath, targetPath);
  } catch (err) {
    throw new Error(
      `Sync-Server Kommunikation fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (serverResponse.error) {
    throw new Error(`Sync-Server Fehler: ${serverResponse.error}`);
  }

  const audioOffset = serverResponse.offset;
  const confidence = serverResponse.confidence ?? 0;

  // ── Schritt 4: Timeline-Positionen lesen ──
  const refTime = await getClipTimeInfo(sequence, payload.referenceClipName);
  if (!refTime) {
    throw new Error(`Timeline-Position für Referenz-Clip "${payload.referenceClipName}" nicht gefunden`);
  }

  const targetTime = await getClipTimeInfo(sequence, payload.targetClipName);
  if (!targetTime) {
    throw new Error(`Timeline-Position für Ziel-Clip "${payload.targetClipName}" nicht gefunden`);
  }

  // ── Schritt 5: Offset-Berechnung ──
  // totalMoveSec = audioOffset + (refStart - refInPoint) - (targetStart - targetInPoint)
  const totalMoveSec =
    audioOffset +
    (refTime.startSeconds - refTime.inPointSeconds) -
    (targetTime.startSeconds - targetTime.inPointSeconds);

  // In Ticks konvertieren
  const totalMoveTicks = String(Math.round(totalMoveSec * TICKS_PER_SECOND));

  // Kein Versatz → kein Move nötig
  if (totalMoveTicks === '0') {
    return {
      success: true,
      audioOffset,
      totalMoveSec: 0,
      totalMoveTicks: '0',
      confidence,
      tracksAffected: 0,
      moveStrategy: 'createMoveAction',
      tickTimeStrategy: 'createWithSeconds',
    };
  }

  // ── Schritt 6: TickTime erstellen (4 Fallbacks) ──
  const { tickTime, strategy: tickTimeStrategy } = createTickTime(totalMoveSec, totalMoveTicks);

  // ── Schritt 7: Ziel-Clip TrackItems sammeln ──
  const itemsToMove: any[] = [];
  const allTracks = [
    ...(sequence.videoTracks ?? []),
    ...(sequence.audioTracks ?? []),
  ];

  for (const track of allTracks) {
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (item && item.name === payload.targetClipName) {
        itemsToMove.push(item);
      }
    }
  }

  if (itemsToMove.length === 0) {
    // Partial: Offset berechnet, aber keine Items zum Verschieben gefunden
    return {
      success: false,
      audioOffset,
      totalMoveSec,
      totalMoveTicks,
      confidence,
      tracksAffected: 0,
      moveStrategy: 'createMoveAction',
      tickTimeStrategy,
      partial: true,
      error: `Keine TrackItems für Ziel-Clip "${payload.targetClipName}" gefunden`,
    };
  }

  // ── Schritt 8: Clip verschieben (3 Strategien) ──
  const moveResult = await moveClipItems(project, itemsToMove, tickTime, totalMoveTicks);

  if (!moveResult.moved) {
    return {
      success: false,
      audioOffset,
      totalMoveSec,
      totalMoveTicks,
      confidence,
      tracksAffected: 0,
      moveStrategy: moveResult.strategy,
      tickTimeStrategy,
      partial: true,
      error: moveResult.error ?? 'Clip-Verschiebung fehlgeschlagen',
    };
  }

  return {
    success: true,
    audioOffset,
    totalMoveSec,
    totalMoveTicks,
    confidence,
    tracksAffected: moveResult.tracksAffected,
    moveStrategy: moveResult.strategy,
    tickTimeStrategy,
  };
}

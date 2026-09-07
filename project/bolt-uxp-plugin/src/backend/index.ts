/**
 * Plugin-Backend Entry Point
 * Läuft im UXP Plugin-Kontext mit Zugriff auf die Premiere Pro API.
 * Kommuniziert mit dem Webview über den Bolt Messaging-Mechanismus.
 *
 * WICHTIG: `require("premierepro")` ist ausschließlich hier im Backend erlaubt.
 * Das Webview hat keinen direkten Zugriff auf die Premiere API.
 */

import type {
  MessageType,
  BridgeRequest,
  BridgeResponse,
  SequenceInfo,
  ClipInfo,
  ClipPosition,
  MoveClipResult,
  MoveClipParams,
} from '../shared/message-types';
import { handleSyncClips } from './sync-engine';

// Premiere API — nur im Backend-Kontext verfügbar
// eslint-disable-next-line @typescript-eslint/no-var-requires
const premierepro = require('premierepro');

// ── Webview Panel Interface ──

interface MessageEvent {
  data: BridgeRequest;
}

interface WebviewPanel {
  postMessage(message: unknown): void;
  addEventListener(event: string, handler: (e: MessageEvent) => void): void;
}

// ── Premiere API Handler ──

async function handleGetSequences(): Promise<SequenceInfo[]> {
  const project = await premierepro.Project.getActiveProject();
  if (!project) {
    throw new Error('Kein Premiere-Projekt geöffnet');
  }

  const sequences = await project.getSequences();
  if (!sequences || !Array.isArray(sequences)) {
    return [];
  }

  return sequences.map((seq: any, index: number) => ({
    id: seq.id ?? `seq_${index}`,
    name: seq.name ?? `Sequenz ${index + 1}`,
    videoTrackCount: seq.videoTracks?.length ?? 0,
    audioTrackCount: seq.audioTracks?.length ?? 0,
  }));
}

async function handleGetClipsFromSequence(payload: { sequenceId: string }): Promise<ClipInfo[]> {
  const project = await premierepro.Project.getActiveProject();
  if (!project) {
    throw new Error('Kein Premiere-Projekt geöffnet');
  }

  const sequences = await project.getSequences();
  const sequence = sequences?.find((s: any) => s.id === payload.sequenceId);
  if (!sequence) {
    throw new Error(`Sequenz "${payload.sequenceId}" nicht gefunden`);
  }

  const clips: ClipInfo[] = [];

  // Video-Tracks iterieren
  const videoTracks = sequence.videoTracks ?? [];
  for (let i = 0; i < videoTracks.length; i++) {
    const track = videoTracks[i];
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (!item) continue;
      clips.push({
        id: item.id ?? `vclip_${i}_${clips.length}`,
        name: item.name ?? 'Unbenannt',
        trackIndex: i,
        trackType: 'video',
        startTicks: String(item.start?.ticks ?? item.startTime?.ticks ?? '0'),
        endTicks: String(item.end?.ticks ?? item.endTime?.ticks ?? '0'),
        inPointTicks: String(item.inPoint?.ticks ?? '0'),
        outPointTicks: String(item.outPoint?.ticks ?? '0'),
        mediaPath: undefined, // wird separat über getMediaFilePath geladen
      });
    }
  }

  // Audio-Tracks iterieren
  const audioTracks = sequence.audioTracks ?? [];
  for (let i = 0; i < audioTracks.length; i++) {
    const track = audioTracks[i];
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (!item) continue;
      clips.push({
        id: item.id ?? `aclip_${i}_${clips.length}`,
        name: item.name ?? 'Unbenannt',
        trackIndex: i,
        trackType: 'audio',
        startTicks: String(item.start?.ticks ?? item.startTime?.ticks ?? '0'),
        endTicks: String(item.end?.ticks ?? item.endTime?.ticks ?? '0'),
        inPointTicks: String(item.inPoint?.ticks ?? '0'),
        outPointTicks: String(item.outPoint?.ticks ?? '0'),
        mediaPath: undefined,
      });
    }
  }

  return clips;
}

async function handleGetMediaFilePath(payload: { sequenceId: string; clipName: string }): Promise<{ path: string | null }> {
  const project = await premierepro.Project.getActiveProject();
  if (!project) {
    throw new Error('Kein Premiere-Projekt geöffnet');
  }

  const sequences = await project.getSequences();
  const sequence = sequences?.find((s: any) => s.id === payload.sequenceId);
  if (!sequence) {
    throw new Error(`Sequenz "${payload.sequenceId}" nicht gefunden`);
  }

  // Alle Tracks durchsuchen nach dem Clip-Namen
  const allTracks = [
    ...(sequence.videoTracks ?? []),
    ...(sequence.audioTracks ?? []),
  ];

  for (const track of allTracks) {
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (!item || item.name !== payload.clipName) continue;

      try {
        // MediaPath-Extraktion: getProjectItem() → ClipProjectItem.cast() → getMediaFilePath()
        const projectItem = await item.getProjectItem?.();
        if (!projectItem) continue;

        const clipProjectItem = premierepro.ClipProjectItem?.cast?.(projectItem) ?? projectItem;
        const mediaPath = await clipProjectItem.getMediaFilePath?.();

        if (mediaPath) {
          return { path: String(mediaPath) };
        }
      } catch {
        // Fallback: nächsten Clip mit gleichem Namen probieren
        continue;
      }
    }
  }

  return { path: null };
}

async function handleGetClipPositions(payload: { sequenceId: string; clipName: string }): Promise<ClipPosition[]> {
  const project = await premierepro.Project.getActiveProject();
  if (!project) {
    throw new Error('Kein Premiere-Projekt geöffnet');
  }

  const sequences = await project.getSequences();
  const sequence = sequences?.find((s: any) => s.id === payload.sequenceId);
  if (!sequence) {
    throw new Error(`Sequenz "${payload.sequenceId}" nicht gefunden`);
  }

  const positions: ClipPosition[] = [];

  const trackSets: Array<{ tracks: any[]; type: 'video' | 'audio' }> = [
    { tracks: sequence.videoTracks ?? [], type: 'video' },
    { tracks: sequence.audioTracks ?? [], type: 'audio' },
  ];

  for (const { tracks, type } of trackSets) {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const trackItems = track?.clips ?? track?.trackItems ?? [];
      for (const item of trackItems) {
        if (!item || item.name !== payload.clipName) continue;

        positions.push({
          clipId: item.id ?? `pos_${type}_${i}_${positions.length}`,
          name: item.name,
          trackType: type,
          trackIndex: i,
          startTicks: String(item.start?.ticks ?? item.startTime?.ticks ?? '0'),
          endTicks: String(item.end?.ticks ?? item.endTime?.ticks ?? '0'),
          inPointTicks: String(item.inPoint?.ticks ?? '0'),
          outPointTicks: String(item.outPoint?.ticks ?? '0'),
        });
      }
    }
  }

  return positions;
}

async function handleMoveClip(payload: MoveClipParams): Promise<MoveClipResult> {
  const project = await premierepro.Project.getActiveProject();
  if (!project) {
    throw new Error('Kein Premiere-Projekt geöffnet');
  }

  const sequences = await project.getSequences();
  const sequence = sequences?.find((s: any) => s.id === payload.sequenceId);
  if (!sequence) {
    throw new Error(`Sequenz "${payload.sequenceId}" nicht gefunden`);
  }

  // Alle TrackItems (Video + Audio) mit dem Clip-Namen sammeln
  const itemsToMove: any[] = [];
  const allTracks = [
    ...(sequence.videoTracks ?? []),
    ...(sequence.audioTracks ?? []),
  ];

  for (const track of allTracks) {
    const trackItems = track?.clips ?? track?.trackItems ?? [];
    for (const item of trackItems) {
      if (item && item.name === payload.clipName) {
        itemsToMove.push(item);
      }
    }
  }

  if (itemsToMove.length === 0) {
    throw new Error(`Keine TrackItems für Clip "${payload.clipName}" gefunden`);
  }

  // TickTime erstellen — 4 Fallback-Strategien (Risiko R-01)
  const offsetTicks = payload.offsetTicks;
  let tickTime: any = null;

  // Strategie 1: createWithTicks (String-basiert, am zuverlässigsten für Ticks)
  try {
    if (premierepro.TickTime?.createWithTicks) {
      tickTime = premierepro.TickTime.createWithTicks(offsetTicks);
    }
  } catch { /* Fallback */ }

  // Strategie 2: createWithSeconds
  if (!tickTime) {
    try {
      const TICKS_PER_SECOND = 254016000000;
      const seconds = Number(offsetTicks) / TICKS_PER_SECOND;
      if (premierepro.TickTime?.createWithSeconds) {
        tickTime = premierepro.TickTime.createWithSeconds(seconds);
      }
    } catch { /* Fallback */ }
  }

  // Strategie 3: new TickTime
  if (!tickTime) {
    try {
      if (premierepro.TickTime) {
        tickTime = new premierepro.TickTime(offsetTicks);
      }
    } catch { /* Fallback */ }
  }

  // Strategie 4: Plain Object
  if (!tickTime) {
    tickTime = { ticks: offsetTicks };
  }

  // Clip verschieben — 3 Strategien (Risiko R-04)
  let strategy: MoveClipResult['strategy'] = 'createMoveAction';
  let moved = false;

  // Strategie 1: createMoveAction() in Transaction
  try {
    await project.lockedAccess(async () => {
      const actions = itemsToMove.map((item: any) => {
        if (item.createMoveAction) {
          return item.createMoveAction(tickTime);
        }
        throw new Error('createMoveAction nicht verfügbar');
      });

      await project.executeTransaction(actions, 'Audio Sync: Clip verschieben');
    });
    moved = true;
  } catch {
    // Strategie 2: createSetStartAction() in Transaction
    strategy = 'createSetStartAction';
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
      moved = true;
    } catch {
      // Strategie 3: Direkt setStartTime()/move()
      strategy = 'direct';
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
        moved = true;
      } catch (err) {
        return {
          moved: false,
          tracksAffected: 0,
          strategy,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  return {
    moved,
    tracksAffected: itemsToMove.length,
    strategy,
  };
}

// ── Message Dispatcher ──

type HandlerMap = {
  [K in MessageType]: (payload: any) => Promise<any>;
};

const handlers: HandlerMap = {
  ping: async () => ({ status: 'ok' }),
  getSequences: handleGetSequences,
  getClipsFromSequence: handleGetClipsFromSequence,
  getMediaFilePath: handleGetMediaFilePath,
  getClipPositions: handleGetClipPositions,
  moveClip: handleMoveClip,
  syncClips: handleSyncClips,
};

// ── Panel Message Handler Setup ──

/**
 * Initialisiert den Message-Handler für die Webview-Kommunikation.
 * Wird vom Bolt UXP Framework beim Panel-Start aufgerufen.
 */
export function setupMessageHandler(panel: WebviewPanel): void {
  panel.addEventListener('message', async (event: MessageEvent) => {
    const { id, type, payload } = event.data;

    if (!id || !type) return;

    const handler = handlers[type as MessageType];

    if (!handler) {
      const response: BridgeResponse = {
        id,
        success: false,
        error: `Unbekannter Message-Typ: "${type}"`,
      };
      panel.postMessage(response);
      return;
    }

    try {
      const result = await handler(payload);
      const response: BridgeResponse = {
        id,
        success: true,
        data: result,
      };
      panel.postMessage(response);
    } catch (error) {
      const response: BridgeResponse = {
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      panel.postMessage(response);
    }
  });
}

import { create } from 'zustand';

// ── TypeScript Interfaces ──

export interface Sequence {
  id: string;
  name: string;
  videoTrackCount: number;
  audioTrackCount: number;
}

export interface Clip {
  id: string;
  name: string;
  trackIndex: number;
  trackType: 'video' | 'audio';
  startTicks: string;
  endTicks: string;
  mediaPath?: string;
}

export interface LinkedClip {
  name: string;
  videoClips: Clip[];
  audioClips: Clip[];
  mediaPath?: string;
}

export interface SyncResultData {
  offset: number;
  confidence: number;
  message?: string;
  error?: string;
}

export type ViewType = 'sequences' | 'clips' | 'sync';
export type SyncStatus = 'idle' | 'loading' | 'success' | 'error' | 'partial';
export type ServerStatus = 'online' | 'offline' | 'checking';
export type StatusBadge = 'default' | 'loading' | 'success' | 'warning' | 'error';

// ── Store State ──

interface AppState {
  // Data
  sequences: Sequence[];
  selectedSequence: Sequence | null;
  clips: Clip[];
  linkedClips: LinkedClip[];
  referenceClip: LinkedClip | null;
  targetClip: LinkedClip | null;

  // UI
  view: ViewType;
  syncTabOpen: boolean;
  searchQuery: string;

  // Status
  syncStatus: SyncStatus;
  syncResult: SyncResultData | null;
  serverStatus: ServerStatus;
  statusBadge: StatusBadge;
  footerText: string;

  // Actions
  setSequences: (sequences: Sequence[]) => void;
  setSelectedSequence: (sequence: Sequence | null) => void;
  setClips: (clips: Clip[]) => void;
  setLinkedClips: (linkedClips: LinkedClip[]) => void;
  setReferenceClip: (clip: LinkedClip | null) => void;
  setTargetClip: (clip: LinkedClip | null) => void;
  selectClipForSync: (clip: LinkedClip) => void;
  setView: (view: ViewType) => void;
  setSyncTabOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setSyncResult: (result: SyncResultData | null) => void;
  setServerStatus: (status: ServerStatus) => void;
  setStatusBadge: (badge: StatusBadge) => void;
  setFooterText: (text: string) => void;
  reset: () => void;
}

// ── Initial State ──

const initialState = {
  sequences: [],
  selectedSequence: null,
  clips: [],
  linkedClips: [],
  referenceClip: null,
  targetClip: null,
  view: 'sequences' as ViewType,
  syncTabOpen: false,
  searchQuery: '',
  syncStatus: 'idle' as SyncStatus,
  syncResult: null,
  serverStatus: 'offline' as ServerStatus,
  statusBadge: 'default' as StatusBadge,
  footerText: 'Bereit',
};

// ── Zustand Store ──

export const useAppStore = create<AppState>()((set) => ({
  ...initialState,

  setSequences: (sequences) =>
    set({
      sequences,
      footerText: `${sequences.length} Sequenzen geladen`,
      statusBadge: sequences.length > 0 ? 'success' : 'default',
    }),

  setSelectedSequence: (selectedSequence) =>
    set({ selectedSequence }),

  setClips: (clips) =>
    set({ clips }),

  setLinkedClips: (linkedClips) =>
    set({ linkedClips }),

  setReferenceClip: (referenceClip) =>
    set({ referenceClip }),

  setTargetClip: (targetClip) =>
    set({ targetClip }),

  selectClipForSync: (clip) =>
    set((state) => {
      // Klick auf bereits ausgewählten REF → Abwählen
      if (state.referenceClip?.name === clip.name) {
        return { referenceClip: null };
      }
      // Klick auf bereits ausgewähltes ZIEL → Abwählen
      if (state.targetClip?.name === clip.name) {
        return { targetClip: null };
      }
      // Kein REF gesetzt → wird REF
      if (!state.referenceClip) {
        return { referenceClip: clip };
      }
      // REF gesetzt, kein ZIEL → wird ZIEL
      if (!state.targetClip) {
        return { targetClip: clip };
      }
      // Beide belegt → Rotation: bisheriges ZIEL wird REF, neuer Clip wird ZIEL
      return { referenceClip: state.targetClip, targetClip: clip };
    }),

  setView: (view) =>
    set({ view }),

  setSyncTabOpen: (syncTabOpen) =>
    set({ syncTabOpen }),

  setSearchQuery: (searchQuery) =>
    set({ searchQuery }),

  setSyncStatus: (syncStatus) =>
    set({ syncStatus }),

  setSyncResult: (syncResult) =>
    set({ syncResult }),

  setServerStatus: (serverStatus) =>
    set({ serverStatus }),

  setStatusBadge: (statusBadge) =>
    set({ statusBadge }),

  setFooterText: (footerText) =>
    set({ footerText }),

  reset: () =>
    set(initialState),
}));

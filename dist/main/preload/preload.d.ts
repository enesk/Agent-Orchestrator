import type { OrchestratorState, LogEntry, StoredSettings } from '../shared/types';
declare const api: {
    getState: () => Promise<OrchestratorState>;
    connect: (url: string, token: string) => Promise<void>;
    disconnect: () => Promise<void>;
    getLogs: () => Promise<LogEntry[]>;
    getSettings: () => Promise<StoredSettings>;
    saveSettings: (settings: Partial<StoredSettings>) => Promise<StoredSettings>;
    minimizeToTray: () => void;
    onStateUpdate: (callback: (state: OrchestratorState) => void) => () => void;
    onLogUpdate: (callback: (entry: LogEntry) => void) => () => void;
};
export type OrchestratorApi = typeof api;
export {};
//# sourceMappingURL=preload.d.ts.map
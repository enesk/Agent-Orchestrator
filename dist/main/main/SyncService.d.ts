import { EventEmitter } from 'events';
import { LocalDatabase } from './LocalDatabase';
import type { ChatMessage, Ticket } from '../shared/types';
export declare class SyncService extends EventEmitter {
    private db;
    private api;
    private backendUrl;
    private token;
    private syncInterval;
    private connectivityInterval;
    private _isSyncing;
    private _isOnline;
    private _lastSyncAt;
    constructor(db: LocalDatabase);
    get isOnline(): boolean;
    get isSyncing(): boolean;
    get lastSyncAt(): Date | null;
    initialize(backendUrl: string, token: string): void;
    checkConnectivity(): Promise<void>;
    processSyncQueue(): Promise<void>;
    private executeSyncItem;
    fetchRemoteMessages(projectId: string, since?: string): Promise<ChatMessage[]>;
    fetchRemoteTickets(projectId: string): Promise<Ticket[]>;
    fullSync(): Promise<void>;
    stop(): void;
}
//# sourceMappingURL=SyncService.d.ts.map
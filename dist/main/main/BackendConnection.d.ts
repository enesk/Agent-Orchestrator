import { EventEmitter } from 'events';
import { OutgoingMessage, OrchestratorState } from '../shared/types';
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export declare class BackendConnection extends EventEmitter {
    private ws;
    private token;
    private backendUrl;
    private status;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectTimer;
    private heartbeatTimer;
    private heartbeatInterval;
    private messageQueue;
    private manualDisconnect;
    getOrchestratorState: (() => OrchestratorState) | null;
    connect(backendUrl: string, token: string): Promise<void>;
    private validateToken;
    disconnect(): void;
    send(message: OutgoingMessage): void;
    getStatus(): ConnectionStatus;
    get connected(): boolean;
    destroy(): void;
    private doConnect;
    private handlePusherFrame;
    private parseFrameData;
    private reconnect;
    private startHeartbeat;
    private stopHeartbeat;
    private flushMessageQueue;
    private setStatus;
    private clearReconnectTimer;
    private stripProtocol;
}
export declare const backendConnection: BackendConnection;
//# sourceMappingURL=BackendConnection.d.ts.map
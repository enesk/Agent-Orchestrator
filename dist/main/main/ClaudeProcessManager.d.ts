import { EventEmitter } from 'events';
export declare class ClaudeProcessManager extends EventEmitter {
    private process;
    private isStarted;
    private claudePath;
    private restartAttempts;
    private maxRestartAttempts;
    private restartDelay;
    private outputBuffer;
    constructor(claudePath?: string);
    start(): Promise<void>;
    stop(): Promise<void>;
    sendCommand(input: string): void;
    isRunning(): boolean;
    detectClaudePath(): Promise<string>;
    private verifyClaudeExists;
    private execQuiet;
}
export declare const claudeProcessManager: ClaudeProcessManager;
//# sourceMappingURL=ClaudeProcessManager.d.ts.map
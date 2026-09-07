import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { LocalDatabase } from './LocalDatabase';
import { SyncService } from './SyncService';
import type { Project } from '../shared/types';
export declare class RateLimitError extends Error {
    retryAfterMs: number;
    constructor(message: string, retryAfterMs?: number);
}
/** Thrown when work is dispatched to an agent the user has stopped. */
export declare class AgentStoppedError extends Error {
    agentName: string;
    constructor(agentName: string);
}
export declare class ChatOrchestrator extends EventEmitter {
    private db;
    private syncService;
    private memoryService;
    private projects;
    private activeAgentSessions;
    private activeClaudeProcesses;
    private userStoppedMessages;
    /**
     * Scope keys with a Claude process running right now. Since ticket work no longer scopes per
     * ticket, the worker pool can put two tickets of the SAME agent+goal in flight at once — and a
     * Claude session must not be resumed by two processes concurrently. The second run goes cold.
     */
    private busyScopeKeys;
    private mainWindow;
    constructor(db: LocalDatabase, syncService: SyncService);
    setMainWindow(win: BrowserWindow | null): void;
    initialize(): void;
    loadProjects(): Project[];
    getProject(id: string): Project | null;
    handleUserMessage(projectId: string, content: string, replyToLocalId?: string, attachments?: import('../shared/types').MessageAttachment[], metadata?: Record<string, string>, promptOverride?: string): Promise<void>;
    private runAgent;
    private buildClaudeScopeKey;
    /**
     * Returns the resumable Claude session id for this scope, or null for a cold start.
     * Mirrors the cwd-match rule in executeClaudePrompt so both agree on resume-vs-fresh —
     * runAgent uses this to decide how much context to (re)send.
     */
    private getResumeSessionId;
    private executeClaudePrompt;
    retryMessage(messageId: string): Promise<void>;
    handleTicketCommentMention(projectId: string, ticketId: string, userComment: string): Promise<void>;
    private processTicketCreation;
    private createTicketFromParsed;
    private replaceTicketCreateTags;
    private processTicketReferences;
    private extractRelevantSnippet;
    private detectStatusChange;
    private processDocumentSave;
    private replaceDocSaveTags;
    private detectsUserQuestion;
    private detectsCompletionMessage;
    private showAgentDoneNotification;
    private sendToRenderer;
    stopAgentSession(sessionId: string): void;
    /** Kill the running Claude process for a specific agent message (chat stop button). */
    stopMessageGeneration(messageId: string): boolean;
    /**
     * Per-agent kill switch. Stopping kills whatever that agent is running right now AND sets a
     * persisted flag so no new run is dispatched to it — neither from chat nor from the autonomous
     * goal loop — until it is resumed. Other agents keep working untouched.
     */
    setAgentStopped(projectId: string, agentId: string, stopped: boolean): {
        killed: number;
    };
    isAgentStopped(projectId: string, agentId: string): boolean;
    /** Kill all running Claude processes and reset agent states (used when cancelling a goal) */
    killAllActiveProcesses(): void;
    /** Kill only Claude processes whose key contains the given goalId tag */
    killProcessesForGoal(goalId: number): void;
    private killProcessesByFilter;
}
//# sourceMappingURL=ChatOrchestrator.d.ts.map
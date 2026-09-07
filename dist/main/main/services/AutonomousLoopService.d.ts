import { BrowserWindow } from 'electron';
import { LocalDatabase } from '../LocalDatabase';
import { ChatOrchestrator } from '../ChatOrchestrator';
import type { ProjectGoal } from '../../shared/types';
export declare class AutonomousLoopService {
    private db;
    private chatOrchestrator;
    private mainWindow;
    private activeGoalAbortControllers;
    constructor(db: LocalDatabase, chatOrchestrator: ChatOrchestrator);
    setMainWindow(win: BrowserWindow | null): void;
    startGoal(projectId: string, description: string, selectedAgentIds?: string[]): Promise<ProjectGoal>;
    /**
     * Start a Vorhaben from a set of hand-picked existing tickets.
     * Skips the Pflichtenheft/ticket-creation phases and goes straight to work,
     * processing the tickets with runtime dependency handling.
     */
    startSelectedTicketsGoal(projectId: string, ticketIds: string[], selectedAgentIds?: string[]): Promise<ProjectGoal>;
    cancelGoal(goalId: number): void;
    retryGoal(goalId: number): Promise<ProjectGoal | null>;
    resumeInterruptedGoals(): Promise<void>;
    private launchStateMachine;
    private runStateMachine;
    private transitionTo;
    private runPflichtenheftPhase;
    private runTicketCreationPhase;
    private runWorkPhase;
    /**
     * Works the goal's tickets with up to MAX_CONCURRENT_WORKERS in parallel.
     * Independent tickets run concurrently; when a worker reports a ticket needs
     * another one done first ([BLOCKED_BY: #X]), that ticket is requeued, #X is
     * pulled in / prioritised, and the blocked ticket resumes once #X is done.
     */
    private runQueuedWorkPhase;
    /** Runs a single ticket through its assigned worker and classifies the result. */
    private workOnTicket;
    /** Map a referenced ticket number to a ticket id, pulling from the project if needed. */
    private resolveDependencyTarget;
    private setTicketStatus;
    private updateActiveCheckpoint;
    private describeActive;
    private finishLog;
    private runReviewPhase;
    /**
     * Runs an agent for a goal phase. When `displayLabel` is given, the CHAT shows only that short
     * line (e.g. "Arbeite Ticket #1 ab") while the agent still receives the full `prompt` as a
     * transient promptOverride — so the ticket body is not duplicated into the chat history.
     */
    private runAgentForGoal;
    private classifyError;
    private failGoal;
    private ensureAgentsExist;
    private ensureSingleAgent;
    private resolveWorkerAgent;
    private buildWorkerPrompt;
    private getCurrentPhase;
    private phaseToStatus;
    private sleep;
    private chunkArray;
    private pushGoalUpdate;
    private pushLogEntry;
    private sendToRenderer;
    private sendPhaseUpdate;
}
//# sourceMappingURL=AutonomousLoopService.d.ts.map
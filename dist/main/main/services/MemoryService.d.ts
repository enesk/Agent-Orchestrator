import type { LocalDatabase } from '../LocalDatabase';
import type { AgentMemory } from '../../shared/types';
export declare class MemoryService {
    private db;
    constructor(db: LocalDatabase);
    /**
     * Parse MEMORY_SAVE / MEMORY_DELETE / MEMORY_CLEAR_ALL commands from agent response.
     * Execute them against the database and return cleaned text with commands stripped.
     */
    processAgentCommands(text: string, globalAgentId: string, projectId?: string): string;
    /**
     * Load memories for prompt injection.
     * Returns project-specific + cross-project memories, sorted by importance.
     * Updates access_count and last_accessed_at.
     */
    getMemoriesForPrompt(globalAgentId: string, projectId?: string): AgentMemory[];
    /**
     * Build the memory block to inject into agent prompts.
     */
    buildMemoryBlock(memories: AgentMemory[]): string;
    saveMemory(globalAgentId: string, projectId: string | null, key: string, value: string, importance: number, source: 'agent' | 'user'): void;
    deleteMemory(id: number): void;
    clearAllMemories(globalAgentId: string): void;
    listMemories(globalAgentId: string): AgentMemory[];
}
//# sourceMappingURL=MemoryService.d.ts.map
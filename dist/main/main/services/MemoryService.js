"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
const Logger_1 = require("../Logger");
const MEMORY_SAVE_REGEX = /\[MEMORY_SAVE:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([1-3])\s*\]/g;
const MEMORY_DELETE_REGEX = /\[MEMORY_DELETE:\s*([^\]]+?)\s*\]/g;
const MEMORY_CLEAR_REGEX = /\[MEMORY_CLEAR_ALL\]/g;
class MemoryService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Parse MEMORY_SAVE / MEMORY_DELETE / MEMORY_CLEAR_ALL commands from agent response.
     * Execute them against the database and return cleaned text with commands stripped.
     */
    processAgentCommands(text, globalAgentId, projectId) {
        let cleaned = text;
        // Process MEMORY_CLEAR_ALL first
        if (MEMORY_CLEAR_REGEX.test(cleaned)) {
            this.db.clearAllMemories(globalAgentId);
            (0, Logger_1.log)('info', `[Memory] Cleared all memories for agent ${globalAgentId}`);
            cleaned = cleaned.replace(MEMORY_CLEAR_REGEX, '');
        }
        // Process MEMORY_DELETE
        let deleteMatch;
        const deleteRegex = new RegExp(MEMORY_DELETE_REGEX.source, 'g');
        while ((deleteMatch = deleteRegex.exec(cleaned)) !== null) {
            const key = deleteMatch[1].trim();
            this.db.deleteMemoryByKey(globalAgentId, key);
            (0, Logger_1.log)('info', `[Memory] Deleted memory "${key}" for agent ${globalAgentId}`);
        }
        cleaned = cleaned.replace(MEMORY_DELETE_REGEX, '');
        // Process MEMORY_SAVE
        let saveMatch;
        const saveRegex = new RegExp(MEMORY_SAVE_REGEX.source, 'g');
        while ((saveMatch = saveRegex.exec(cleaned)) !== null) {
            const key = saveMatch[1].trim();
            const value = saveMatch[2].trim();
            const importance = parseInt(saveMatch[3], 10);
            this.db.saveMemory(globalAgentId, projectId ?? null, key, value, importance, 'agent');
            (0, Logger_1.log)('info', `[Memory] Saved memory "${key}" (importance=${importance}) for agent ${globalAgentId}`);
        }
        cleaned = cleaned.replace(MEMORY_SAVE_REGEX, '');
        // Clean up leftover whitespace from removed commands
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
        return cleaned;
    }
    /**
     * Load memories for prompt injection.
     * Returns project-specific + cross-project memories, sorted by importance.
     * Updates access_count and last_accessed_at.
     */
    getMemoriesForPrompt(globalAgentId, projectId) {
        const memories = this.db.getMemoriesForAgent(globalAgentId, projectId);
        // Touch all accessed memories
        if (memories.length > 0) {
            this.db.touchMemories(memories.map((m) => m.id));
        }
        return memories;
    }
    /**
     * Build the memory block to inject into agent prompts.
     */
    buildMemoryBlock(memories) {
        if (memories.length === 0)
            return '';
        const IMPORTANCE_LABELS = { 3: 'HIGH', 2: 'MED', 1: 'LOW' };
        const lines = memories.map((m) => {
            const label = IMPORTANCE_LABELS[m.importance] ?? 'LOW';
            return `[${label}] ${m.key}: ${m.value}`;
        });
        return [
            ``,
            `[Agent Memory (Long-Term)]`,
            ...lines,
            `[End Memory]`,
            ``,
        ].join('\n');
    }
    // CRUD for manual management
    saveMemory(globalAgentId, projectId, key, value, importance, source) {
        this.db.saveMemory(globalAgentId, projectId, key, value, importance, source);
    }
    deleteMemory(id) {
        this.db.deleteMemory(id);
    }
    clearAllMemories(globalAgentId) {
        this.db.clearAllMemories(globalAgentId);
    }
    listMemories(globalAgentId) {
        return this.db.getAllMemoriesForAgent(globalAgentId);
    }
}
exports.MemoryService = MemoryService;
//# sourceMappingURL=MemoryService.js.map
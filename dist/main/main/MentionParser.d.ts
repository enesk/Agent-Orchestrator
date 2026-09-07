import type { ProjectAgent, ChatMessage } from '../shared/types';
export declare class MentionParser {
    extractMentions(text: string): string[];
    resolveMentionsToAgents(mentions: string[], agents: ProjectAgent[]): ProjectAgent[];
    buildAgentContext(agent: ProjectAgent, allMessages: ChatMessage[], currentMessageId: string, threadMessages?: ChatMessage[]): ChatMessage[];
    /**
     * Slim prompt for a RESUMED Claude session. The system prompt and the large fixed instruction
     * blocks (ticket/document/memory systems, communication rules) are already in the resumed
     * session from the first turn, so we only (re)send the *dynamic* context that may have changed
     * — current tickets/docs/memory, thread context, recent messages — plus the new task. This is
     * the biggest per-turn token saver for interactive chat.
     */
    buildResumePromptForAgent(agent: ProjectAgent, contextMessages: ChatMessage[], currentMessage: ChatMessage, ticketsSummary?: string, metadataContext?: string, documentsSummary?: string, threadContext?: {
        parentMessage: ChatMessage;
        replies: ChatMessage[];
    }, memoryBlock?: string): string;
    buildPromptForAgent(agent: ProjectAgent, contextMessages: ChatMessage[], currentMessage: ChatMessage, allAgents: ProjectAgent[], ticketsSummary?: string, metadataContext?: string, documentsSummary?: string, threadContext?: {
        parentMessage: ChatMessage;
        replies: ChatMessage[];
    }, memoryBlock?: string): string;
}
export declare const mentionParser: MentionParser;
//# sourceMappingURL=MentionParser.d.ts.map
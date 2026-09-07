"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mentionParser = exports.MentionParser = void 0;
const MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;
class MentionParser {
    extractMentions(text) {
        const matches = text.matchAll(MENTION_REGEX);
        const mentions = new Set();
        for (const match of matches) {
            mentions.add(`@${match[1].toLowerCase()}`);
        }
        return Array.from(mentions);
    }
    resolveMentionsToAgents(mentions, agents) {
        const resolved = new Map();
        for (const mention of mentions) {
            const normalized = mention.toLowerCase();
            for (const agent of agents) {
                if (agent.mentionKey.toLowerCase() === normalized && !resolved.has(agent.id)) {
                    resolved.set(agent.id, agent);
                }
            }
        }
        return Array.from(resolved.values());
    }
    buildAgentContext(agent, allMessages, currentMessageId, threadMessages) {
        // Collect IDs of all thread messages so we can prioritize them
        const threadIds = new Set();
        if (threadMessages) {
            for (const m of threadMessages)
                threadIds.add(m.id);
        }
        const relevant = allMessages.filter((m) => {
            if (m.id === currentMessageId)
                return true;
            if (threadIds.has(m.id))
                return true;
            if (m.agentLocalId === agent.id)
                return true;
            if (m.mentions?.some((mention) => mention.toLowerCase() === agent.mentionKey.toLowerCase()))
                return true;
            return false;
        });
        // If we have thread messages, also add any that might not be in allMessages (edge case with limit)
        if (threadMessages) {
            const existingIds = new Set(relevant.map((m) => m.id));
            for (const tm of threadMessages) {
                if (!existingIds.has(tm.id))
                    relevant.push(tm);
            }
        }
        // Last 30 relevant messages, chronologically sorted
        return relevant
            .sort((a, b) => a.clientTimestamp.localeCompare(b.clientTimestamp))
            .slice(-30);
    }
    /**
     * Slim prompt for a RESUMED Claude session. The system prompt and the large fixed instruction
     * blocks (ticket/document/memory systems, communication rules) are already in the resumed
     * session from the first turn, so we only (re)send the *dynamic* context that may have changed
     * — current tickets/docs/memory, thread context, recent messages — plus the new task. This is
     * the biggest per-turn token saver for interactive chat.
     */
    buildResumePromptForAgent(agent, contextMessages, currentMessage, ticketsSummary, metadataContext, documentsSummary, threadContext, memoryBlock) {
        const chatHistory = contextMessages
            .map((m) => {
            const sender = m.role === 'user' ? 'User' : (m.agentName ?? 'Agent');
            return `${sender}: ${m.content}`;
        })
            .join('\n\n');
        const parts = [];
        if (metadataContext)
            parts.push(metadataContext);
        if (ticketsSummary) {
            parts.push(``, `[Aktueller Ticket-Stand]`, ticketsSummary);
        }
        if (documentsSummary) {
            parts.push(``, `[Vorhandene Dokumente]`, documentsSummary);
        }
        if (memoryBlock)
            parts.push(memoryBlock);
        if (threadContext) {
            const parentSender = threadContext.parentMessage.role === 'user' ? 'User' : (threadContext.parentMessage.agentName ?? 'Agent');
            const threadHistory = [
                `${parentSender}: ${threadContext.parentMessage.content}`,
                ...threadContext.replies.map((r) => {
                    const sender = r.role === 'user' ? 'User' : (r.agentName ?? 'Agent');
                    return `${sender}: ${r.content}`;
                }),
            ].join('\n\n');
            parts.push(``, `[Thread-Kontext]`, threadHistory);
        }
        if (chatHistory) {
            parts.push(``, `[Neue/relevante Nachrichten]`, chatHistory);
        }
        parts.push(``, `[Deine Aufgabe]`, currentMessage.content);
        return parts.filter(Boolean).join('\n');
    }
    buildPromptForAgent(agent, contextMessages, currentMessage, allAgents, ticketsSummary, metadataContext, documentsSummary, threadContext, memoryBlock) {
        const otherAgents = allAgents
            .filter((a) => a.id !== agent.id)
            .map((a) => a.mentionKey)
            .join(', ');
        const chatHistory = contextMessages
            .map((m) => {
            const sender = m.role === 'user' ? 'User' : (m.agentName ?? 'Agent');
            return `${sender}: ${m.content}`;
        })
            .join('\n\n');
        const parts = [
            `[System]`,
            agent.systemPrompt,
            ``,
            `Du bist ${agent.name} in einem Projekt-Chat.`,
            `Dein Mention-Key: ${agent.mentionKey}`,
            otherAgents ? `Andere verfügbare Agenten: ${otherAgents}` : '',
            otherAgents ? `Du kannst andere Agenten mit @AgentName ansprechen, wenn du konkret Input oder eine Aktion von ihnen brauchst.` : '',
            `Antworte präzise auf die dir gestellte Aufgabe.`,
            `Beginne NICHT mit "Als ${agent.name}..." – schreibe direkt deine Antwort.`,
            ``,
            `WICHTIG — Kommunikationsregeln:`,
            `- Du KANNST andere Agenten mit @Name ansprechen, um ihnen Aufgaben zu geben oder Fragen zu stellen. Sie werden dann automatisch aktiviert.`,
            `- Erwähne einen Agenten nur wenn du eine KONKRETE Aufgabe, Frage oder Arbeitsanweisung an ihn hast.`,
            `- Erwähne KEINE anderen Agenten nur um zu bestätigen, zu danken, zusammenzufassen oder "Bescheid zu geben".`,
            `- Wenn deine Aufgabe erledigt ist, antworte kurz und sachlich. KEINE Rückmeldungen wie "Ich habe alles erledigt, @Agent kannst weiter machen".`,
            `- Wenn du eine Aufgabe an einen anderen Agenten delegierst, beschreibe KLAR was er tun soll.`,
        ];
        // Always inject ticket system info, even if no tickets exist yet
        parts.push(``, `[Ticket-System]`, `Dieses Projekt hat ein integriertes Ticket-System (ähnlich wie Jira/Linear).`, `Tickets werden im "Tickets"-Tab als Kanban-Board angezeigt (Offen → In Bearbeitung → Erledigt).`);
        if (ticketsSummary) {
            parts.push(``, `Aktuelle Tickets:`, ticketsSummary);
        }
        else {
            parts.push(`Es gibt aktuell keine Tickets in diesem Projekt.`);
        }
        parts.push(``, `WICHTIGE REGELN zum Ticket-System:`, `- Referenziere Tickets immer mit #Nummer (z.B. #1, #2). Das System erkennt diese Referenzen automatisch und erstellt Kommentare auf dem Ticket.`, `- Wenn du an einem Ticket arbeitest, erwähne es in deiner Antwort: "Ich arbeite an #3..."`, `- Wenn du ein Ticket erledigst, schreibe z.B. "#3 ist erledigt" oder "#3 fertig" — der Status wird automatisch auf "Erledigt" gesetzt.`, `- Wenn du mit einem Ticket beginnst, schreibe z.B. "Ich starte #3" — der Status wechselt zu "In Bearbeitung".`, `- Tickets können kategorisiert werden: bug, feature, task, improvement, documentation, question`, `- Du kannst neue Tickets ERSTELLEN mit zwei Formaten:`, ``, `  Kurzformat (für einfache Tickets):`, `  [TICKET_CREATE: Titel | Kurze Beschreibung | Kategorie]`, `  Beispiel: [TICKET_CREATE: Login-Bug fixen | Button reagiert nicht | bug]`, ``, `  Blockformat (für ausführliche Beschreibungen mit Markdown):`, `  [TICKET_CREATE: Titel | Kategorie]`, `  Ausführliche Beschreibung hier...`, `  Kann mehrere Zeilen und **Markdown** enthalten.`, `  - Aufzählungen`, `  - Code-Beispiele`, `  [/TICKET_CREATE]`, ``, `  Beispiel:`, `  [TICKET_CREATE: API Refactoring | task]`, `  ## Ziel`, `  Die REST API soll auf GraphQL umgestellt werden.`, `  ## Schritte`, `  1. Schema definieren`, `  2. Resolver implementieren`, `  3. Tests schreiben`, `  [/TICKET_CREATE]`, ``, `- Wenn der User dich bittet ein Ticket zu erstellen, nutze IMMER eines der TICKET_CREATE Formate.`, `- Schreibe AUSFÜHRLICHE Beschreibungen mit allen relevanten Details, Schritten und Kontext.`, `- Prüfe ob deine aktuelle Aufgabe zu einem offenen Ticket passt und referenziere es.`, `- Dir zugewiesene Tickets sind besonders relevant — beachte sie bei deiner Arbeit.`, `- Wenn der User nach dem Ticket-System fragt, erkläre wie es funktioniert.`);
        if (metadataContext) {
            parts.push(metadataContext);
        }
        // Document system
        parts.push(``, `[Dokumente-System]`, `Dieses Projekt hat ein Dokumenten-System für Forschungsnotizen, Analysen und Wissenssammlung.`, `Alle Agenten können Dokumente lesen und schreiben.`, ``, `Du kannst Dokumente ERSTELLEN oder AKTUALISIEREN mit diesem Format:`, `[DOC_SAVE: Titel des Dokuments]`, `Inhalt des Dokuments hier...`, `[/DOC_SAVE]`, ``, `Beispiel: [DOC_SAVE: API-Analyse]Die API hat folgende Endpoints: ...[\\/DOC_SAVE]`, `Nutze Dokumente um Forschungsergebnisse, Analysen, Notizen oder wichtige Informationen zu speichern.`, `Andere Agenten können diese Dokumente einsehen und darauf aufbauen.`);
        if (documentsSummary) {
            parts.push(``, `Vorhandene Dokumente:`, documentsSummary);
        }
        else {
            parts.push(`Es gibt aktuell keine Dokumente in diesem Projekt.`);
        }
        // Agent Memory
        if (memoryBlock) {
            parts.push(memoryBlock);
        }
        parts.push(``, `[Langzeit-Gedächtnis System]`, `Du hast ein persistentes Langzeit-Gedächtnis. Nutze folgende Befehle (werden automatisch verarbeitet und aus der Antwort entfernt):`, `- Speichern: [MEMORY_SAVE: schlüssel | wert | wichtigkeit] (wichtigkeit: 1=niedrig, 2=mittel, 3=hoch)`, `- Löschen: [MEMORY_DELETE: schlüssel]`, `- Alles löschen: [MEMORY_CLEAR_ALL]`, `Speichere wichtige Fakten, Präferenzen, Entscheidungen und Kontext, die über Gespräche hinweg relevant sind.`);
        // Thread context — critical for thread replies so agents remember the conversation
        if (threadContext) {
            const parentSender = threadContext.parentMessage.role === 'user' ? 'User' : (threadContext.parentMessage.agentName ?? 'Agent');
            const threadHistory = [
                `${parentSender}: ${threadContext.parentMessage.content}`,
                ...threadContext.replies.map((r) => {
                    const sender = r.role === 'user' ? 'User' : (r.agentName ?? 'Agent');
                    return `${sender}: ${r.content}`;
                }),
            ].join('\n\n');
            parts.push(``, `[Thread-Kontext]`, `Dies ist eine Antwort in einem Thread. Hier ist der vollständige Thread-Verlauf:`, ``, threadHistory, ``, `WICHTIG: Beziehe dich auf den obigen Thread-Verlauf. Der User antwortet auf diesen Thread. Vergiss NICHT was du zuvor in diesem Thread geschrieben hast.`);
        }
        parts.push(``, `[Relevanter Chat-Verlauf]`, chatHistory, ``, `[Deine Aufgabe]`, currentMessage.content);
        return parts.filter(Boolean).join('\n');
    }
}
exports.MentionParser = MentionParser;
exports.mentionParser = new MentionParser();
//# sourceMappingURL=MentionParser.js.map
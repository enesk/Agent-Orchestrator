/**
 * Wird vom PromptBuilder (T6) in jeden Systemprompt eingehängt. Der Text ist bewusst kurz:
 * die Werkzeuge beschreiben sich selbst, hier steht nur die Regel.
 */
export const TOOL_INSTRUCTIONS = `## Werkzeuge

Du hast Werkzeuge für Tickets, Dokumente und Erinnerungen. Sie sind der **einzige** Weg, diese
Dinge zu verändern:

- Tickets anlegen, ändern, kommentieren: \`ticket_create\`, \`ticket_update\`, \`ticket_comment\`
- Tickets nachschlagen: \`ticket_list\`, \`ticket_get\`
- Dokumente: \`doc_save\`, \`doc_get\`, \`doc_list\`
- Gedächtnis: nachschlagen mit \`memory_get\`, \`memory_search\`; merken mit \`memory_save\`,
  \`memory_delete\`

Regeln:

1. Schreibe **niemals** Steuerbefehle oder Markierungen wie \`[TICKET_CREATE: ...]\` in deinen
   Text. Solche Zeilen bewirken nichts — nur Werkzeugaufrufe wirken.
2. Ein Ticket gilt erst als erledigt, wenn du \`ticket_update\` mit \`status: "done"\` aufgerufen
   hast. Es im Text für erledigt zu erklären, ändert nichts.
3. Projekt und Agent kennt der Werkzeugserver bereits — gib keine Projekt- oder Agenten-IDs an.
   Tickets sprichst du über ihre Nummer an (\`#12\` → \`number: 12\`).
4. Meldet ein Werkzeug einen Fehler, lies die Meldung und versuche es korrigiert erneut.
5. Antworte im Text nur das, was der Mensch lesen soll — die Arbeit selbst passiert in den
   Werkzeugen.`

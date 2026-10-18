import { TOOL_INSTRUCTIONS } from '../mcp'
import * as memory from '../memory/MemoryService'
import { clamp } from './workerPrompt'
import type { Agent, Goal, Ticket } from '@shared/types'
import { mainT } from '../app/settings'

export {
  WORKER_ROLE_NOTE,
  buildWorkerPrompt,
  SPEC_EXCERPT_LIMIT,
  type WorkerPromptInput,
} from './workerPrompt'

/** Titel, unter dem ein Vorhaben sein Pflichtenheft ablegt. Pro Projekt eindeutig. */
export function specDocumentTitle(goal: Goal): string {
  return `Pflichtenheft — ${clamp(goal.title, 80)}`
}

/**
 * Der Systemprompt eines Laufs: die Persönlichkeit des Agenten, sein Gedächtnis, die
 * Werkzeugregeln und ein Hinweis auf die Rolle in genau diesem Schritt. Bewusst hier gebaut
 * und nicht aus dem Chat übernommen — ein Vorhabenlauf hat keinen Chat-Kontext.
 */
export function buildSystemAppend(agent: Agent, projectId: string, roleNote: string): string {
  const block = memory.buildPromptIndex(agent.id, projectId)
  const sections = [agent.systemPrompt.trim()]

  if (block) {
    sections.push(`## Gedächtnis\n\n${block}`)
  }
  sections.push(TOOL_INSTRUCTIONS)
  sections.push(`## Dieser Lauf\n\n${roleNote.trim()}`)

  return sections.filter(Boolean).join('\n\n')
}

// --- Pflichtenheft ----------------------------------------------------------

export const SPEC_ROLE_NOTE = `Du arbeitest gerade autonom an einem Vorhaben; es sitzt niemand
davor, den du fragen könntest. Liefere das Pflichtenheft vollständig ab und speichere es über
\`doc_save\`. Lege in diesem Schritt keine Tickets an.`

export function buildSpecPrompt(goal: Goal): string {
  return [
    `# Vorhaben: ${goal.title}`,
    '',
    'Beschreibung des Vorhabens:',
    '',
    goal.description?.trim() || goal.title,
    '',
    '## Auftrag',
    '',
    'Sieh dir zuerst das Repository an, so weit es für dieses Vorhaben nötig ist. Schreibe dann',
    'ein Pflichtenheft in Markdown mit genau diesen Abschnitten:',
    '',
    '1. **Zieldefinition** — was nach dem Vorhaben gilt, in drei bis fünf Sätzen.',
    '2. **Ist-Zustand** — wie es heute im Repository aussieht, mit konkreten Pfaden.',
    '3. **Soll-Zustand** — wie es danach aussieht.',
    '4. **Funktionale Anforderungen** — durchnummeriert als `FA-01`, `FA-02`, … je eine prüfbare',
    '   Anforderung pro Zeile.',
    '5. **Nicht-funktionale Anforderungen** — Leistung, Bedienung, Wartbarkeit, Sicherheit.',
    '6. **Technische Rahmenbedingungen** — Stack, Konventionen und Grenzen aus diesem Repository.',
    '7. **Offene Fragen** — alles, was du nicht sicher entscheiden konntest.',
    '',
    `Speichere das Ergebnis mit \`doc_save\` unter genau diesem Titel: „${specDocumentTitle(goal)}".`,
    'Antworte im Text danach nur mit zwei bis drei Sätzen Zusammenfassung.',
  ].join('\n')
}

// --- Tickets ----------------------------------------------------------------

export const TICKETS_ROLE_NOTE = `Du arbeitest gerade autonom an einem Vorhaben. Lege die Tickets
über \`ticket_create\` an — sie werden dem Vorhaben automatisch zugeordnet. Ändere keinen Code.`

export function buildTicketsPrompt(goal: Goal, spec: string, maxTickets: number): string {
  return [
    `# Vorhaben: ${goal.title}`,
    '',
    '## Pflichtenheft',
    '',
    spec.trim() || goal.description?.trim() || goal.title,
    '',
    '## Auftrag',
    '',
    `Zerlege das Pflichtenheft in höchstens ${maxTickets} Tickets und lege jedes einzeln mit`,
    '`ticket_create` an. Für jedes Ticket gilt:',
    '',
    '- Der Titel benennt das Arbeitspaket in einem Satzfragment.',
    '- Die Beschreibung nennt Zweck, betroffene Dateien oder Bereiche und die zugehörigen',
    '  Anforderungsnummern aus dem Pflichtenheft.',
    '- Am Ende der Beschreibung steht ein Abschnitt „Akzeptanzkriterien" mit einer Liste',
    '  überprüfbarer Punkte.',
    '- Die Kategorie passt zur Arbeit (`feature`, `bug`, `task`, `improvement`, `documentation`).',
    '',
    'Schneide die Tickets so, dass sie möglichst unabhängig voneinander sind. Muss ein Ticket',
    'zwingend auf ein anderes warten, schreibe das ausdrücklich in seine Beschreibung.',
    'Lege die Tickets in der Reihenfolge an, in der sie bearbeitet werden sollten.',
    '',
    'Antworte im Text nur mit einer kurzen Liste der angelegten Tickets.',
  ].join('\n')
}

/** Die kurze Zeile, die im Chat-Verlauf erscheint — der volle Prompt bleibt draußen. */
export function workerChatLine(ticket: Ticket): string {
  return mainT()('main.goal.chat.worker', { number: ticket.number, title: ticket.title })
}

// --- Review -----------------------------------------------------------------

export const REVIEW_ROLE_NOTE = `Du prüfst gerade autonom das Ergebnis eines Vorhabens. Melde
dein Urteil ausschließlich über \`goal_report\` — der Ablauf liest nur diese Meldung.`

export interface ReviewPromptInput {
  goal: Goal
  spec: string | null
  done: readonly Ticket[]
  open: readonly Ticket[]
  blocked: readonly Ticket[]
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const { goal, spec, done, open, blocked } = input
  const lines = [
    `# Abnahme des Vorhabens: ${goal.title}`,
    '',
    '## Ziel',
    '',
    goal.description?.trim() || goal.title,
  ]

  if (spec?.trim()) {
    lines.push('', '## Pflichtenheft', '', spec.trim())
  }

  lines.push(
    '',
    '## Ticketstand',
    '',
    '### Erledigt',
    '',
    ticketLines(done),
    '',
    '### Offen',
    '',
    ticketLines(open),
    '',
    '### Blockiert',
    '',
    ticketLines(blocked),
    '',
    '## Auftrag',
    '',
    'Prüfe im Repository, ob das Ziel tatsächlich erreicht ist. Verlass dich nicht auf den',
    'Ticketstatus, sondern sieh dir die betroffenen Stellen an. Achte besonders auf Platzhalter,',
    'leere Funktionsrümpfe und Anforderungen, die nur halb umgesetzt sind.',
    '',
    'Melde das Ergebnis am Ende genau einmal:',
    '',
    '- Alles erfüllt → `goal_report` mit `kind: "complete"` und einer kurzen Begründung.',
    '- Es fehlt etwas → lege **zuerst** für jeden Mangel ein Nachbesserungs-Ticket mit',
    '  `ticket_create` an (Titel, was fehlt, Akzeptanzkriterien) und rufe **danach**',
    '  `goal_report` mit `kind: "retry"` auf.',
    '',
    'Ändere selbst keinen Code und führe keine Test-Suites oder vollständigen Builds aus.',
  )

  return lines.join('\n')
}

function ticketLines(tickets: readonly Ticket[]): string {
  if (tickets.length === 0) return '—'
  return tickets.map((ticket) => `- #${ticket.number}: ${ticket.title}`).join('\n')
}

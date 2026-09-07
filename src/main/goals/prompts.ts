import { TICKET_CATEGORIES, TICKET_STATUS_LABELS } from '@shared/constants'
import { TOOL_INSTRUCTIONS } from '../mcp'
import * as memory from '../memory/MemoryService'
import type { Agent, Goal, Ticket } from '@shared/types'

/** So viel Pflichtenheft passt in einen Worker-Prompt, ohne ihn zu sprengen. */
const SPEC_EXCERPT_LIMIT = 2_000

const CATEGORY_LABELS = new Map(TICKET_CATEGORIES.map((entry) => [entry.value, entry.label]))

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
  const block = memory.buildBlock(memory.getForPrompt(agent.id, projectId))
  const sections = [agent.systemPrompt.trim()]

  if (block) {
    sections.push(`## Gedächtnis\n\nWas du dir aus früheren Läufen gemerkt hast:\n\n${block}`)
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

// --- Arbeit -----------------------------------------------------------------

export const WORKER_ROLE_NOTE = `Du arbeitest gerade autonom an einem Ticket eines Vorhabens.
Du hast keinen Chat-Verlauf und kannst niemanden fragen — alles, was du brauchst, steht in der
Aufgabe. Melde das Ergebnis über die Werkzeuge, nicht im Fließtext.`

export interface WorkerPromptInput {
  ticket: Ticket
  spec: string | null
  otherTickets: readonly Ticket[]
  dependencies: readonly Ticket[]
}

/**
 * Selbsttragend: der Lauf bekommt keinen Chat-Kontext, deshalb steht hier alles, was zum
 * Abarbeiten nötig ist. Im Chat landet nur eine kurze Zeile, nicht dieser Text.
 */
export function buildWorkerPrompt(input: WorkerPromptInput): string {
  const { ticket, spec, otherTickets, dependencies } = input
  const lines = [
    `# Ticket #${ticket.number}: ${ticket.title}`,
    '',
    `Kategorie: ${CATEGORY_LABELS.get(ticket.category) ?? ticket.category}`,
    '',
    '## Beschreibung',
    '',
    ticket.description?.trim() || '(keine Beschreibung hinterlegt)',
  ]

  if (dependencies.length > 0) {
    lines.push(
      '',
      '## Vorarbeit',
      '',
      'Diese Tickets sind bereits erledigt und ihre Ergebnisse liegen im Repository:',
      '',
      ...dependencies.map((entry) => `- #${entry.number}: ${entry.title}`),
    )
  }

  if (spec?.trim()) {
    lines.push('', '## Pflichtenheft (Auszug)', '', clamp(spec.trim(), SPEC_EXCERPT_LIMIT))
  }

  if (otherTickets.length > 0) {
    lines.push(
      '',
      '## Übrige Tickets des Vorhabens',
      '',
      'Nur zur Orientierung — fass sie nicht an:',
      '',
      ...otherTickets.map(
        (entry) => `- #${entry.number} [${TICKET_STATUS_LABELS[entry.status]}] ${entry.title}`,
      ),
    )
  }

  lines.push(
    '',
    '## Regeln',
    '',
    '1. Arbeite die Akzeptanzkriterien vollständig ab und dokumentiere das Ergebnis mit',
    '   `ticket_comment` — was du geändert hast und in welchen Dateien.',
    `2. Bist du fertig, rufe \`ticket_update\` mit \`number: ${ticket.number}\` und`,
    '   `status: "done"` auf. Ohne diesen Aufruf gilt das Ticket als offen.',
    '3. Kannst du das Ticket nicht lösen, erkläre den Grund mit `ticket_comment` und setze den',
    '   Status **nicht** auf erledigt.',
    '4. Setzt dieses Ticket zwingend ein anderes, noch offenes Ticket voraus, rufe **sofort**',
    '   `goal_report` mit `kind: "blocked_by"` und der Nummer des blockierenden Tickets auf und',
    '   arbeite nicht weiter.',
    '5. Lege keine neuen Tickets an.',
    '6. Führe **keine** Test-Suites und **keine** vollständigen Builds aus. Zum Absichern genügt',
    '   der günstigste Weg, etwa ein Typecheck der geänderten Datei. Tests schreibst oder',
    '   startest du nur, wenn dieses Ticket sie ausdrücklich verlangt.',
    '7. Hast du etwas gelernt, das über dieses Ticket hinaus gilt — Architektur, Konventionen,',
    '   Befehle —, halte es mit `memory_save` fest: höchstens drei Einträge, nur stabile',
    '   Tatsachen, nicht was du in diesem Ticket geändert hast.',
  )

  return lines.join('\n')
}

/** Die kurze Zeile, die im Chat-Verlauf erscheint — der volle Prompt bleibt draußen. */
export function workerChatLine(ticket: Ticket): string {
  return `Arbeite Ticket #${ticket.number} ab: ${ticket.title}`
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

function clamp(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

import { TICKET_CATEGORIES, TICKET_STATUS_LABELS } from '@shared/constants'
import {
  TICKET_ATTACHMENT_INTRO,
  TICKET_ATTACHMENT_TITLE,
  attachmentPromptBody,
} from '../agents/attachmentPrompt'
import type { AgentQuestion, MessageAttachment, Ticket } from '@shared/types'

/**
 * Der Arbeitsauftrag eines Worker-Laufs, bewusst ohne Datenbank-, MCP- und Electron-Bezug:
 * reine Funktion über ihre Eingabe. Nur so lässt sich im Test prüfen, was tatsächlich im
 * Prompt landet — und vor allem, was darin **nicht** gekürzt wird.
 */

/** So viel Pflichtenheft passt in einen Worker-Prompt, ohne ihn zu sprengen. */
export const SPEC_EXCERPT_LIMIT = 2_000

/** So viel vom letzten Kommentar wandert in den Wiederholungs-Prompt. */
const LAST_COMMENT_LIMIT = 1_200

const CATEGORY_LABELS = new Map(TICKET_CATEGORIES.map((entry) => [entry.value, entry.label]))

export const WORKER_ROLE_NOTE = `Du arbeitest gerade autonom an einem Ticket eines Vorhabens.
Du hast keinen Chat-Verlauf; es sitzt niemand davor, der auf dich wartet. Alles, was du zum
Arbeiten brauchst, steht in der Aufgabe. Melde das Ergebnis über die Werkzeuge, nicht im
Fließtext.

Die einzige Ausnahme vom „du fragst nicht" ist \`ask_user\`, und sie gilt nur für eine
Entscheidung, die dir nicht zusteht: etwas Unumkehrbares oder nach außen Wirkendes —
veröffentlichen, zusammenführen, löschen, verschicken, Kosten auslösen. Dann fragst du,
statt zu raten oder still stehen zu bleiben; dein Lauf endet damit, und du wirst mit der
Antwort erneut gestartet.

Abweichend von der Zurückhaltungsregel „keine Tickets ungefragt" darfst du hier ein Ticket
anlegen — aber nur für **notwendige** Arbeit, ohne die dieses Ticket nicht fertig wird und die
nicht hineingehört. Nicht für Befunde am Rand: „Mir ist noch aufgefallen, dass…" bleibt ein Satz
in \`ticket_comment\`. Alles andere am Block bleibt in Kraft.`

export interface WorkerPromptInput {
  ticket: Ticket
  spec: string | null
  otherTickets: readonly Ticket[]
  dependencies: readonly Ticket[]
  /**
   * Die Vorgaben des Ticketsets, aus dem dieses Ticket stammt — **vollständig**. Anders als
   * das Pflichtenheft werden sie nicht gekürzt: es sind meist Verbote, und der Agent weiß
   * nicht, dass er nach ihnen fragen müsste. Ohne Vorgaben-Dokument `null`.
   */
  guidelines: string | null
  /** Die Dateien am Ticket — sie gehen als Pfad in den Prompt, nicht als Inhalt. */
  attachments: readonly MessageAttachment[]
  /** Der wievielte Anlauf dieses Tickets gerade beginnt; 1 ist der erste. */
  attempt?: number
  /** Die letzte Begründung des vorigen Agenten aus `ticket_comment`. */
  lastComment?: string | null
  /**
   * Rückfragen zu diesem Ticket, die der Nutzer beantwortet hat oder die verfallen sind (A3).
   * Sie stehen vollständig im Prompt: eine Antwort, die der nächste Lauf nicht sieht, wäre
   * schlimmer als keine Frage.
   */
  answeredQuestions?: readonly AgentQuestion[]
}

/**
 * Selbsttragend: der Lauf bekommt keinen Chat-Kontext, deshalb steht hier alles, was zum
 * Abarbeiten nötig ist. Im Chat landet nur eine kurze Zeile, nicht dieser Text.
 */
export function buildWorkerPrompt(input: WorkerPromptInput): string {
  const { ticket, spec, otherTickets, dependencies } = input
  const attempt = input.attempt ?? 1
  const lines = [
    `# Ticket #${ticket.number}: ${ticket.title}`,
    '',
    `Kategorie: ${CATEGORY_LABELS.get(ticket.category) ?? ticket.category}`,
    '',
    '## Beschreibung',
    '',
    ticket.description?.trim() || '(keine Beschreibung hinterlegt)',
  ]

  const attachments = attachmentPromptBody(input.attachments, TICKET_ATTACHMENT_INTRO)
  if (attachments) {
    lines.push('', `## ${TICKET_ATTACHMENT_TITLE}`, '', attachments)
  }

  // Vor allem Weiteren — insbesondere vor den Regeln: sie entscheiden mit, was erlaubt ist.
  const guidelines = input.guidelines?.trim()
  if (guidelines) {
    lines.push(
      '',
      '## Vorgaben des Ticketsets',
      '',
      'Diese Vorgaben kommen aus der Importdatei dieses Tickets und gelten vollständig. Was',
      'hier ausgeschlossen wird, tust du nicht — auch dann nicht, wenn es naheliegt oder die',
      'allgemeinen Regeln weiter unten es erlauben würden.',
      '',
      guidelines,
      '',
      // Das Dokument bringt eigene Überschriften mit; ohne Schlussmarke wäre nicht zu sehen,
      // wo es endet und der nächste Abschnitt dieses Auftrags beginnt.
      '(Ende der Vorgaben des Ticketsets.)',
    )
  }

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

  const questions = input.answeredQuestions ?? []
  if (questions.length > 0) {
    lines.push('', '## Deine Rückfragen', '')
    for (const entry of questions) {
      lines.push(`**Frage:** ${entry.question.trim()}`)
      const context = entry.context?.trim()
      if (context) lines.push('', `Dein Kontext dazu: ${context}`)
      lines.push(
        '',
        entry.status === 'answered'
          ? `**Antwort des Nutzers:** ${entry.answer?.trim() || '(leer)'}`
          : '**Unbeantwortet:** darauf hat in sieben Tagen niemand geantwortet.',
        '',
      )
    }
    lines.push(
      'Die Antworten sind die Entscheidung — richte dich danach und frage nicht erneut nach',
      'demselben Punkt. Blieb eine Frage unbeantwortet, wähle den Weg, der am wenigsten kaputt',
      'macht, und tu insbesondere nichts Unumkehrbares.',
    )
  }

  if (attempt > 1) {
    lines.push(
      '',
      '## Wiederholung',
      '',
      `Das ist Versuch ${attempt} an diesem Ticket — die vorigen Anläufe haben es nicht`,
      'abgeschlossen. Wiederhole nicht, was schon gescheitert ist, sondern wähle einen anderen',
      'Weg und bring das Ticket diesmal zu Ende.',
    )
    const last = input.lastComment?.trim()
    if (last) {
      lines.push(
        '',
        'Zuletzt hat der vorige Agent das hier hinterlassen:',
        '',
        clamp(last, LAST_COMMENT_LIMIT),
      )
    }
  }

  lines.push(
    '',
    '## Regeln',
    '',
    '1. Arbeite die Akzeptanzkriterien vollständig ab und dokumentiere das Ergebnis mit',
    '   `ticket_comment` — was du geändert hast und in welchen Dateien.',
    `2. Bist du fertig, rufe \`ticket_update\` mit \`number: ${ticket.number}\` und`,
    '   `status: "done"` auf. Ohne diesen Aufruf gilt das Ticket als offen.',
    '3. Technische Entscheidungen trifft du selbst. Gibt es mehrere vertretbare Wege, wähle den,',
    '   der am wenigsten kaputt macht, und halte deine Annahme mit `ticket_comment` fest. Frage',
    '   nicht nach Bestätigung und nicht danach, was im Ticket steht oder im Repository zu finden',
    '   ist. Nur wenn eine Entscheidung dir nicht zusteht — etwas Unumkehrbares oder nach außen',
    '   Wirkendes wie veröffentlichen, zusammenführen, löschen, verschicken, Kosten auslösen —,',
    '   rufst du `ask_user` auf. Dein Lauf endet damit; das Ticket bleibt in Arbeit, und du wirst',
    '   mit der Antwort erneut gestartet. Still stehen zu bleiben ist in diesem Fall das',
    '   Schlechteste: dann weiß niemand, dass du wartest.',
    '4. `goal_report` mit `kind: "blocked_by"` ist nur für **echte, umfangreiche** Vorbedingungen',
    '   gedacht: ein anderes, noch offenes Ticket, dessen Arbeit erst getan sein muss. Ist die',
    '   Vorarbeit klein und liegt in Reichweite, **erledige sie selbst** und vermerke das mit',
    '   `ticket_comment`, statt zurückzumelden.',
    '5. Stößt du auf Arbeit, die **notwendig** ist, damit dieses Ticket fertig wird, aber nicht',
    '   hineingehört, lege dafür mit `ticket_create` ein eigenes Ticket an. Es wird automatisch',
    '   Teil dieses Vorhabens und abgearbeitet. Das ist die einzige Ausnahme: für alles, was dir',
    '   nur **nebenbei auffällt** — ein Fehler woanders, eine unschöne Stelle, eine Idee —, legst',
    '   du **kein** Ticket an. Das schreibst du in einem Satz in deinen `ticket_comment` und',
    '   lässt es ansonsten liegen.',
    '6. Führe **keine** Test-Suites und **keine** vollständigen Builds aus. Zum Absichern genügt',
    '   der günstigste Weg, etwa ein Typecheck der geänderten Datei. Tests schreibst oder',
    '   startest du nur, wenn dieses Ticket sie ausdrücklich verlangt.',
  )

  return lines.join('\n')
}

export function clamp(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

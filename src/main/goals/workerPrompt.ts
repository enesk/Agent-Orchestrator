import { TICKET_CATEGORIES, TICKET_STATUS_LABELS } from '@shared/constants'
import {
  TICKET_ATTACHMENT_INTRO,
  TICKET_ATTACHMENT_TITLE,
  attachmentPromptBody,
} from '../agents/attachmentPrompt'
import type { MessageAttachment, Ticket } from '@shared/types'

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
Du hast keinen Chat-Verlauf und kannst niemanden fragen — alles, was du brauchst, steht in der
Aufgabe. Melde das Ergebnis über die Werkzeuge, nicht im Fließtext.`

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
    '3. Du entscheidest selbst und wartest nie auf Rückfragen. Gibt es mehrere vertretbare Wege,',
    '   wähle den, der am wenigsten kaputt macht, und halte deine Annahme mit `ticket_comment`',
    '   fest. Frage nicht nach Bestätigung — es liest niemand mit.',
    '4. `goal_report` mit `kind: "blocked_by"` ist nur für **echte, umfangreiche** Vorbedingungen',
    '   gedacht: ein anderes, noch offenes Ticket, dessen Arbeit erst getan sein muss. Ist die',
    '   Vorarbeit klein und liegt in Reichweite, **erledige sie selbst** und vermerke das mit',
    '   `ticket_comment`, statt zurückzumelden.',
    '5. Stößt du auf notwendige Arbeit, die nicht in dieses Ticket gehört, lege dafür mit',
    '   `ticket_create` ein eigenes Ticket an. Es wird automatisch Teil dieses Vorhabens und',
    '   abgearbeitet.',
    '6. Führe **keine** Test-Suites und **keine** vollständigen Builds aus. Zum Absichern genügt',
    '   der günstigste Weg, etwa ein Typecheck der geänderten Datei. Tests schreibst oder',
    '   startest du nur, wenn dieses Ticket sie ausdrücklich verlangt.',
    '7. Hast du etwas gelernt, das über dieses Ticket hinaus gilt — Architektur, Konventionen,',
    '   Befehle —, halte es mit `memory_save` fest: höchstens drei Einträge, nur stabile',
    '   Tatsachen, nicht was du in diesem Ticket geändert hast. Ein Eintrag ist **ein Satz**,',
    '   keine Erklärung.',
  )

  return lines.join('\n')
}

export function clamp(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

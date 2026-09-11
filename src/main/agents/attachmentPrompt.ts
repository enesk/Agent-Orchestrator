import path from 'node:path'
import type { MessageAttachment } from '@shared/types'
import { getAttachmentsRoot } from '../app/attachments'

/**
 * Anhänge kommen für die Agenten immer gleich formuliert: eine Zeile je Datei mit Name, Art und
 * absolutem Pfad. Der Inhalt wird bewusst **nicht** inliniert — eine 300 KB große HTML-Datei in
 * den Prompt zu kopieren wäre Verschwendung, die CLI liest die Datei mit ihrem eigenen Werkzeug
 * gezielt nach.
 */

const KIND_BY_EXTENSION: Record<string, string> = {
  '.png': 'Bild',
  '.jpg': 'Bild',
  '.jpeg': 'Bild',
  '.gif': 'Bild',
  '.webp': 'Bild',
  '.svg': 'Bild',
  '.md': 'Markdown',
  '.markdown': 'Markdown',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.csv': 'Tabelle',
}

/** Die Endung wiegt schwerer als der MIME-Typ: aus dem Finder gezogene Dateien kommen ohne an. */
function kindLabel(attachment: MessageAttachment): string {
  const byExtension = KIND_BY_EXTENSION[path.extname(attachment.fileName).toLowerCase()]
  if (byExtension) return byExtension
  if ((attachment.mimeType ?? '').startsWith('image/')) return 'Bild'
  return 'Dokument'
}

export function attachmentPromptLines(attachments: readonly MessageAttachment[]): string[] {
  const root = getAttachmentsRoot()
  return attachments.map(
    (attachment) =>
      `- ${attachment.fileName} (${kindLabel(attachment)}): ` +
      path.join(root, attachment.relativePath),
  )
}

/** Der Textkörper eines Anhangsabschnitts, oder `null`, wenn es keine Anhänge gibt. */
export function attachmentPromptBody(
  attachments: readonly MessageAttachment[],
  intro: string,
): string | null {
  if (attachments.length === 0) return null
  return [intro, '', ...attachmentPromptLines(attachments)].join('\n')
}

export const MESSAGE_ATTACHMENT_TITLE = 'Anhänge der Nachricht'

export const MESSAGE_ATTACHMENT_INTRO = [
  'Der Nutzer hat diese Dateien zur Prüfung angehängt. Die Pfade sind absolut und liegen',
  'außerhalb des Projektverzeichnisses — lies jede Datei mit deinem Read-Werkzeug, bevor du',
  'antwortest, und geh in deiner Antwort inhaltlich auf sie ein.',
].join('\n')

export const TICKET_ATTACHMENT_TITLE = 'Anhänge des Tickets'

export const TICKET_ATTACHMENT_INTRO = [
  'An diesem Ticket hängen diese Dateien. Die Pfade sind absolut und liegen außerhalb des',
  'Projektverzeichnisses — lies jede Datei mit deinem Read-Werkzeug, bevor du zu arbeiten',
  'anfängst, und richte deine Arbeit inhaltlich nach ihnen aus.',
].join('\n')

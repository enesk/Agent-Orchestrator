import { ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from '@shared/constants'
import { formatBytes, type Translator } from '@shared/i18n'
import type { MessageAttachment } from '@shared/types'
import { activeT } from '../../i18n/active'

export type AttachmentKind = 'image' | 'markdown' | 'html' | 'table' | 'document'

export function attachmentUrl(attachment: MessageAttachment): string {
  return `attachment://${attachment.relativePath}`
}

export function isImage(attachment: MessageAttachment): boolean {
  return attachmentKind(attachment.fileName, attachment.mimeType) === 'image'
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
const MARKDOWN_EXTENSIONS = ['.md', '.markdown']
const HTML_EXTENSIONS = ['.html', '.htm']
const TABLE_EXTENSIONS = ['.csv']

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

/**
 * Die Art einer Datei entscheidet über Symbol und Öffnen-Verhalten. Die Endung wiegt schwerer
 * als der MIME-Typ: aus dem Finder abgelegte `.md`-Dateien kommen ohne MIME-Typ an.
 */
export function attachmentKind(fileName: string, mimeType: string | null): AttachmentKind {
  const extension = extensionOf(fileName)
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'
  if (MARKDOWN_EXTENSIONS.includes(extension)) return 'markdown'
  if (HTML_EXTENSIONS.includes(extension)) return 'html'
  if (TABLE_EXTENSIONS.includes(extension)) return 'table'
  if (extension === '') {
    if ((mimeType ?? '').startsWith('image/')) return 'image'
    if (mimeType === 'text/markdown') return 'markdown'
    if (mimeType === 'text/html') return 'html'
  }
  return 'document'
}

export function kindOf(attachment: MessageAttachment): AttachmentKind {
  return attachmentKind(attachment.fileName, attachment.mimeType)
}

/** Liest eine Datei als Base64 ohne den `data:`-Präfix, wie `chat.saveAttachment` es erwartet. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error(activeT()('attachment.readFailed')))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

const EXTENSION_BY_IMAGE_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

/**
 * Ein aus der Zwischenablage eingefügtes Bild kommt je nach Quelle ohne Namen oder ohne Endung
 * an — beides würde sonst an der Endungsprüfung scheitern.
 */
export function attachmentFileName(file: File): string {
  const t = activeT()
  const name = file.name?.trim() ?? ''
  if (name && extensionOf(name)) return name
  const extension = EXTENSION_BY_IMAGE_MIME[file.type] ?? ''
  if (!extension) return name || t('attachment.fallbackName')
  return `${name || t('attachment.fallbackImageName')}${extension}`
}

export interface FileSelection {
  accepted: File[]
  /** Sammelmeldung über alle abgelehnten Dateien, oder `null`, wenn nichts abgelehnt wurde. */
  error: string | null
}

/**
 * Trennt anhängbare von abgelehnten Dateien. Abgelehntes wird nie stillschweigend verworfen —
 * der Aufrufer zeigt `error` an.
 */
export function selectAttachableFiles(files: Iterable<File>, t: Translator): FileSelection {
  const accepted: File[] = []
  const rejected: string[] = []

  for (const file of files) {
    const name = attachmentFileName(file)
    if (!ATTACHMENT_EXTENSIONS.includes(extensionOf(name))) {
      rejected.push(t('attachment.unsupported', { name }))
      continue
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push(
        t('attachment.tooLarge', {
          name,
          size: formatBytes(t.language, file.size),
          max: formatBytes(t.language, MAX_ATTACHMENT_BYTES),
        }),
      )
      continue
    }
    accepted.push(file)
  }

  return {
    accepted,
    error:
      rejected.length === 0
        ? null
        : t('attachment.rejected', {
            reasons: rejected.join('. '),
            allowed: t('attachment.allowedList'),
          }),
  }
}

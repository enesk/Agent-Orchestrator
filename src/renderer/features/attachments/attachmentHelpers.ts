import { ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from '@shared/constants'
import type { MessageAttachment } from '@shared/types'

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

const SIZE_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** Größe in lesbarer Form, deutsch formatiert — etwa `12,4 KB`. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${SIZE_FORMAT.format(value)} ${units[unit]}`
}

/** Liest eine Datei als Base64 ohne den `data:`-Präfix, wie `chat.saveAttachment` es erwartet. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

const ALLOWED_LIST = 'Bilder, Markdown, Text, HTML, JSON, CSV, Log, YAML und PDF'

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
  const name = file.name?.trim() ?? ''
  if (name && extensionOf(name)) return name
  const extension = EXTENSION_BY_IMAGE_MIME[file.type] ?? ''
  if (!extension) return name || 'Datei'
  return `${name || 'Bild'}${extension}`
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
export function selectAttachableFiles(files: Iterable<File>): FileSelection {
  const accepted: File[] = []
  const rejected: string[] = []

  for (const file of files) {
    const name = attachmentFileName(file)
    if (!ATTACHMENT_EXTENSIONS.includes(extensionOf(name))) {
      rejected.push(`„${name}" hat einen nicht unterstützten Dateityp`)
      continue
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push(
        `„${name}" ist ${formatFileSize(file.size)} groß — erlaubt sind höchstens ${formatFileSize(MAX_ATTACHMENT_BYTES)} je Datei`,
      )
      continue
    }
    accepted.push(file)
  }

  return {
    accepted,
    error: rejected.length === 0 ? null : `${rejected.join('. ')}. Möglich sind ${ALLOWED_LIST}.`,
  }
}

import { TICKET_CATEGORIES, type TicketCategory } from '@shared/constants'
import type { MessageAttachment } from '@shared/types'

export function categoryOption(category: TicketCategory) {
  return TICKET_CATEGORIES.find((option) => option.value === category) ?? TICKET_CATEGORIES[2]!
}

export function attachmentUrl(attachment: MessageAttachment): string {
  return `attachment://${attachment.relativePath}`
}

export function isImage(attachment: MessageAttachment): boolean {
  return (attachment.mimeType ?? '').startsWith('image/')
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

import { TICKET_CATEGORIES, type TicketCategory, type TicketStatus } from '@shared/constants'
import type { TranslationKey } from '@shared/i18n'

export function categoryOption(category: TicketCategory) {
  return TICKET_CATEGORIES.find((option) => option.value === category) ?? TICKET_CATEGORIES[2]!
}

export function categoryLabelKey(category: TicketCategory): TranslationKey {
  return `ticket.category.${category}`
}

export function statusLabelKey(status: TicketStatus): TranslationKey {
  return `ticket.status.${status}`
}

export { attachmentUrl, isImage, readFileAsBase64 } from '../attachments'

import { TICKET_CATEGORIES, type TicketCategory } from '@shared/constants'

export function categoryOption(category: TicketCategory) {
  return TICKET_CATEGORIES.find((option) => option.value === category) ?? TICKET_CATEGORIES[2]!
}

export { attachmentUrl, isImage, readFileAsBase64 } from '../attachments'

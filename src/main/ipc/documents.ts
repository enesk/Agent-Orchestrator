import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const documentsHandlers: DomainHandlers<'documents'> = createStubHandlers('documents')

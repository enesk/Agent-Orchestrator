import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const ticketsHandlers: DomainHandlers<'tickets'> = createStubHandlers('tickets')

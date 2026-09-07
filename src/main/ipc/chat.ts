import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const chatHandlers: DomainHandlers<'chat'> = createStubHandlers('chat')

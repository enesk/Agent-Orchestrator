import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const claudeHandlers: DomainHandlers<'claude'> = createStubHandlers('claude')

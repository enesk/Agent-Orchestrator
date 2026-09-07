import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const agentsHandlers: DomainHandlers<'agents'> = createStubHandlers('agents')

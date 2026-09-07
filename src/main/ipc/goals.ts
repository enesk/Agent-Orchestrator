import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const goalsHandlers: DomainHandlers<'goals'> = createStubHandlers('goals')

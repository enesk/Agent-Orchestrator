import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const memoryHandlers: DomainHandlers<'memory'> = createStubHandlers('memory')

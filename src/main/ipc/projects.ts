import { createStubHandlers, type DomainHandlers } from './registry'

/** Wird von einem späteren Ticket gefüllt. */
export const projectsHandlers: DomainHandlers<'projects'> = createStubHandlers('projects')

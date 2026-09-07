import { agentsHandlers } from './agents'
import { chatHandlers } from './chat'
import { claudeHandlers } from './claude'
import { documentsHandlers } from './documents'
import { goalsHandlers } from './goals'
import { logsHandlers } from './logs'
import { memoryHandlers } from './memory'
import { projectsHandlers } from './projects'
import { registerDomain } from './registry'
import { settingsHandlers } from './settings'
import { ticketsHandlers } from './tickets'

export function registerIpcHandlers(): void {
  registerDomain('projects', projectsHandlers)
  registerDomain('agents', agentsHandlers)
  registerDomain('chat', chatHandlers)
  registerDomain('tickets', ticketsHandlers)
  registerDomain('documents', documentsHandlers)
  registerDomain('memory', memoryHandlers)
  registerDomain('goals', goalsHandlers)
  registerDomain('settings', settingsHandlers)
  registerDomain('claude', claudeHandlers)
  registerDomain('logs', logsHandlers)
}

export { emitEvent } from './events'
export { registerDomain, createStubHandlers, withStubs } from './registry'
export type { DomainHandlers } from './registry'

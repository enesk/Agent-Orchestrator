import { agentsHandlers } from './agents'
import { appHandlers } from './app'
import { attachmentsHandlers } from './attachments'
import { chatHandlers } from './chat'
import { claudeHandlers } from './claude'
import { documentsHandlers } from './documents'
import { goalsHandlers } from './goals'
import { logsHandlers } from './logs'
import { mcpHandlers } from './mcp'
import { memoryHandlers } from './memory'
import { projectsHandlers } from './projects'
import { pushHandlers } from './push'
import { registerDomain } from './registry'
import { remoteHandlers } from './remote'
import { settingsHandlers } from './settings'
import { skillsHandlers } from './skills'
import { ticketsHandlers } from './tickets'

export function registerIpcHandlers(): void {
  registerDomain('projects', projectsHandlers)
  registerDomain('agents', agentsHandlers)
  registerDomain('chat', chatHandlers)
  registerDomain('tickets', ticketsHandlers)
  registerDomain('documents', documentsHandlers)
  registerDomain('skills', skillsHandlers)
  registerDomain('mcp', mcpHandlers)
  registerDomain('memory', memoryHandlers)
  registerDomain('goals', goalsHandlers)
  registerDomain('settings', settingsHandlers)
  registerDomain('claude', claudeHandlers)
  registerDomain('logs', logsHandlers)
  registerDomain('app', appHandlers)
  registerDomain('attachments', attachmentsHandlers)
  registerDomain('remote', remoteHandlers)
  registerDomain('push', pushHandlers)
}

export { emitEvent, observeEvents } from './events'
export { registerDomain } from './registry'
export type { DomainHandlers } from './registry'

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDocumentTools } from './documents'
import { registerGoalTools } from './goal'
import { registerMemoryTools } from './memory'
import { registerTicketTools } from './tickets'
import type { ToolContext } from './context'

export { type ToolContext } from './context'

/** Alle Werkzeuge eines Laufs, fest an dessen Kontext gebunden. */
export function registerAllTools(server: McpServer, tool: ToolContext): void {
  registerTicketTools(server, tool)
  registerDocumentTools(server, tool)
  registerMemoryTools(server, tool)
  registerGoalTools(server, tool)
}

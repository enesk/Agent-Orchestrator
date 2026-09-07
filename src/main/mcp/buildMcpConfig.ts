import type { RunMcpConfig } from '../claude/ClaudeRunner'
import { getUrl } from './McpServer'

/** Präfix, unter dem die CLI die Werkzeuge dieses Servers führt. */
export const MCP_TOOL_PREFIX = 'mcp__orchestrator__'

/**
 * Die `--mcp-config`-Nutzlast für einen Lauf. Das Token steckt im Header, nicht in der URL —
 * so landet es nicht in Prozesslisten von Zwischenschichten oder in Server-Logs.
 */
export function buildMcpConfig(token: string): RunMcpConfig {
  return {
    configJson: JSON.stringify({
      mcpServers: {
        orchestrator: {
          type: 'http',
          url: getUrl(),
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    }),
    allowedTools: [`${MCP_TOOL_PREFIX}*`],
  }
}

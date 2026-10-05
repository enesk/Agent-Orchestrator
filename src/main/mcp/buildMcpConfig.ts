import type { RunMcpConfig } from '../claude/ClaudeRunner'
import { listMcpServersForProject } from '../db/repositories/mcpServers'
import { describeError, scopedLogger } from '../Logger'
import { mcpToolPattern, RESERVED_MCP_SERVER_NAMES } from '@shared/mcpServerName'
import { getUrl } from './McpServer'
import { decryptSecrets } from './secretStore'

const log = scopedLogger('mcp.config')

/** Präfix, unter dem die CLI die Werkzeuge dieses Servers führt. */
export const MCP_TOOL_PREFIX = 'mcp__orchestrator__'

/**
 * Die `--mcp-config`-Nutzlast für einen Lauf. Das Token steckt im Header, nicht in der URL —
 * so landet es nicht in Prozesslisten von Zwischenschichten oder in Server-Logs.
 *
 * Dazu kommen die dem Projekt zugewiesenen externen Server. Gemessen (siehe
 * `REPORT-MEASURE-UNITY-MCP.md`) kostet ein solcher Server rund 1.400 Eingabe-Token je Lauf —
 * nur die Werkzeugnamen gehen in den Prompt, die Eingabeschemas gar nicht. `allowedTools` wird
 * deshalb pro Server mit `mcp__<name>__*` freigegeben: eine Auswahl einzelner Werkzeuge spart
 * nachweislich keine Token. Ein nicht erreichbarer Server ist harmlos, die CLI meldet ihn als
 * `failed` und der Lauf gelingt ohne seine Werkzeuge.
 */
export function buildMcpConfig(token: string, projectId?: string | null): RunMcpConfig {
  const mcpServers: Record<string, unknown> = {
    orchestrator: {
      type: 'http',
      url: getUrl(),
      headers: { Authorization: `Bearer ${token}` },
    },
  }
  const allowedTools = [`${MCP_TOOL_PREFIX}*`]

  for (const server of projectId ? listMcpServersForProject(projectId) : []) {
    // Der Name ist beim Speichern normalisiert und `orchestrator` dort belegt. Hier nochmal,
    // damit eine von Hand geänderte Datenbank den eigenen Server nicht verdrängen kann.
    if (RESERVED_MCP_SERVER_NAMES.includes(server.name) || mcpServers[server.name]) {
      log.warn('Externer MCP-Server übersprungen, Name ist belegt', { name: server.name })
      continue
    }
    const entry = toCliEntry(server)
    if (!entry) continue
    mcpServers[server.name] = entry
    allowedTools.push(mcpToolPattern(server.name))
  }

  return { configJson: JSON.stringify({ mcpServers }), allowedTools }
}

type ServerRecord = ReturnType<typeof listMcpServersForProject>[number]

/**
 * Ein unvollständiger oder nicht entschlüsselbarer Eintrag wird weggelassen statt halb
 * mitgeschickt: ein Server ohne seinen Token antwortet mit 401 und der Agent bekäme einen
 * Fehler, wo er einfach keine Werkzeuge haben sollte.
 */
function toCliEntry(server: ServerRecord): Record<string, unknown> | null {
  try {
    if (server.transport === 'stdio') {
      if (!server.command) {
        log.warn('stdio-Server ohne Befehl übersprungen', { name: server.name })
        return null
      }
      const env = decryptSecrets(server.envEncrypted)
      return {
        type: 'stdio',
        command: server.command,
        args: server.args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      }
    }

    if (!server.url) {
      log.warn('Server ohne URL übersprungen', { name: server.name })
      return null
    }
    const headers = decryptSecrets(server.headersEncrypted)
    return {
      type: server.transport,
      url: server.url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    }
  } catch (error) {
    log.error('Externer MCP-Server ließ sich nicht aufbereiten', {
      name: server.name,
      ...describeError(error),
    })
    return null
  }
}

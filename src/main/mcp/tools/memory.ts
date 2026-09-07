import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as memory from '../../memory/MemoryService'
import { scopedLogger } from '../../Logger'
import type { ToolContext } from './context'
import { fail, ok } from './result'

const log = scopedLogger('mcp.memory')

export function registerMemoryTools(server: McpServer, tool: ToolContext): void {
  const { projectId, agentId } = tool.context

  server.registerTool(
    'memory_save',
    {
      title: 'Erinnerung speichern',
      description:
        'Merkt sich eine Tatsache für spätere Läufe. Gleicher Schlüssel überschreibt die ' +
        'vorherige Fassung. Nur für Dauerhaftes — kein Ersatz für Ticket-Kommentare.',
      inputSchema: {
        key: z.string().min(1).describe('Kurzer, stabiler Schlüssel, z.B. „build-befehl"'),
        value: z.string().min(1).describe('Der zu merkende Sachverhalt'),
        importance: z
          .number()
          .int()
          .min(1)
          .max(3)
          .describe('1 = beiläufig, 2 = normal, 3 = wichtig'),
      },
      annotations: { title: 'Erinnerung speichern' },
    },
    ({ key, value, importance }) => {
      memory.save({ agentId, projectId, key: key.trim(), value, importance, source: 'agent' })
      log.info('Erinnerung über Werkzeug gespeichert', { projectId, agentId, key })
      return ok(`Erinnerung „${key}" gespeichert.`)
    },
  )

  server.registerTool(
    'memory_delete',
    {
      title: 'Erinnerung löschen',
      description: 'Löscht eine Erinnerung, die nicht mehr stimmt.',
      inputSchema: { key: z.string().min(1) },
      annotations: { title: 'Erinnerung löschen' },
    },
    ({ key }) => {
      const needle = key.trim()
      const found = memory.list({ agentId, projectId })
      // Projektbezogene Erinnerungen haben Vorrang vor den globalen desselben Schlüssels.
      const match =
        found.find((entry) => entry.key === needle && entry.projectId === projectId) ??
        found.find((entry) => entry.key === needle)
      if (!match) return fail(`Es gibt keine Erinnerung mit dem Schlüssel „${key}".`)

      memory.remove(match.id)
      return ok(`Erinnerung „${needle}" gelöscht.`)
    },
  )
}

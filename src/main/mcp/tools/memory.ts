import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { MEMORY_VALUE_CHAR_LIMIT } from '@shared/memoryIndex'
import type { AgentMemory } from '@shared/types'
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
        'vorherige Fassung. Nur für Dauerhaftes — kein Ersatz für Ticket-Kommentare. Ein ' +
        `Eintrag ist ein Satz, höchstens ${MEMORY_VALUE_CHAR_LIMIT} Zeichen.`,
      inputSchema: {
        key: z.string().min(1).describe('Kurzer, stabiler Schlüssel, z.B. „build-befehl"'),
        value: z.string().min(1).describe('Der zu merkende Sachverhalt, ein Satz'),
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
      if (value.length > MEMORY_VALUE_CHAR_LIMIT) {
        return fail(
          `Nicht gespeichert: der Wert hat ${value.length} Zeichen, erlaubt sind ` +
            `${MEMORY_VALUE_CHAR_LIMIT}. Ein Eintrag ist ein einzelner Fakt — kürze ihn auf das ` +
            'Wesentliche oder teile ihn auf mehrere Schlüssel auf.',
        )
      }
      memory.save({ agentId, projectId, key: key.trim(), value, importance, source: 'agent' })
      log.info('Erinnerung über Werkzeug gespeichert', { projectId, agentId, key })
      return ok(`Erinnerung „${key}" gespeichert.`)
    },
  )

  server.registerTool(
    'memory_get',
    {
      title: 'Erinnerungen abrufen',
      description:
        'Liefert den vollen Inhalt zu Schlüsseln aus deinem Gedächtnisverzeichnis im Prompt. ' +
        'Mehrere Schlüssel auf einmal abrufen, statt nacheinander.',
      inputSchema: {
        keys: z.array(z.string().min(1)).min(1).describe('Schlüssel genau wie im Verzeichnis'),
      },
      annotations: { title: 'Erinnerungen abrufen', readOnlyHint: true },
    },
    ({ keys }) => {
      const { found, missing } = memory.getByKeys(agentId, projectId, keys)
      log.info('Erinnerungen abgerufen', { projectId, agentId, keys, found: found.length })
      const parts = found.map(render)
      if (missing.length > 0) {
        parts.push(
          `Keine Erinnerung zu: ${missing.map((key) => `„${key}"`).join(', ')}. ` +
            'Mit `memory_search` lässt sich nach ähnlichen Einträgen suchen.',
        )
      }
      return ok(parts.join('\n\n'))
    },
  )

  server.registerTool(
    'memory_search',
    {
      title: 'Gedächtnis durchsuchen',
      description:
        'Durchsucht Schlüssel und Inhalt deiner Erinnerungen nach Suchwörtern — für den Fall, ' +
        'dass kein Schlüssel im Verzeichnis offensichtlich passt.',
      inputSchema: {
        query: z.string().min(1).describe('Ein oder mehrere Suchwörter'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe(`Höchstzahl der Treffer, Standard ${memory.SEARCH_DEFAULT_LIMIT}`),
      },
      annotations: { title: 'Gedächtnis durchsuchen', readOnlyHint: true },
    },
    ({ query, limit }) => {
      const hits = memory.search(agentId, projectId, query, limit)
      log.info('Gedächtnis durchsucht', { projectId, agentId, query, hits: hits.length })
      if (hits.length === 0) return ok(`Keine Erinnerung passt zu „${query}".`)
      return ok(hits.map(render).join('\n\n'))
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

function render(entry: AgentMemory): string {
  return `### ${entry.key}\n${entry.value}`
}

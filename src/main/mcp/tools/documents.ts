import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { findDocumentByTitle } from '../../db/repositories/documents'
import * as documents from '../../documents/DocumentService'
import { scopedLogger } from '../../Logger'
import type { ToolContext } from './context'
import { fail, ok } from './result'

const log = scopedLogger('mcp.documents')

export function registerDocumentTools(server: McpServer, tool: ToolContext): void {
  const { projectId, agentId } = tool.context

  server.registerTool(
    'doc_save',
    {
      title: 'Dokument speichern',
      description:
        'Speichert ein Dokument im aktuellen Projekt. Gibt es bereits eines mit diesem Titel, ' +
        'wird es überschrieben — Titel sind pro Projekt eindeutig.',
      inputSchema: {
        title: z.string().min(1).describe('Titel, z.B. „Pflichtenheft"'),
        content: z.string().describe('Vollständiger Inhalt in Markdown'),
      },
      annotations: { title: 'Dokument speichern' },
    },
    ({ title, content }) => {
      const document = documents.save({ projectId, title, content, agentId })
      log.info('Dokument über Werkzeug gespeichert', {
        projectId,
        agentId,
        documentId: document.id,
        title: document.title,
      })
      return ok(`Dokument „${document.title}" gespeichert (ID ${document.id}).`)
    },
  )

  server.registerTool(
    'doc_get',
    {
      title: 'Dokument lesen',
      description: 'Liefert den Inhalt eines Dokuments des aktuellen Projekts.',
      inputSchema: { title: z.string().min(1) },
      annotations: { title: 'Dokument lesen', readOnlyHint: true },
    },
    ({ title }) => {
      const document = findDocumentByTitle(projectId, title.trim())
      if (!document) return fail(`Es gibt kein Dokument „${title}" in diesem Projekt.`)
      return ok(document.content)
    },
  )

  server.registerTool(
    'doc_list',
    {
      title: 'Dokumente auflisten',
      description: 'Listet Titel und Änderungsdatum aller Dokumente des aktuellen Projekts.',
      annotations: { title: 'Dokumente auflisten', readOnlyHint: true },
    },
    () => {
      const found = documents.list(projectId)
      if (found.length === 0) return ok('Keine Dokumente vorhanden.')
      return ok(found.map((entry) => `- ${entry.title} (geändert ${entry.updatedAt})`).join('\n'))
    },
  )
}

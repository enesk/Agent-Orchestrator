import {
  createDocument,
  deleteDocument,
  findDocumentByTitle,
  getDocument,
  listDocuments,
  updateDocument,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from '../db/repositories/documents'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import type { ProjectDocument } from '@shared/types'

const log = scopedLogger('documents')

export function list(projectId: string): ProjectDocument[] {
  return listDocuments(projectId)
}

export function get(id: string): ProjectDocument | null {
  return getDocument(id)
}

/**
 * Titel sind pro Projekt eindeutig: schreibt ein Agent ein Dokument zweimal, entsteht kein
 * zweites Pflichtenheft, sondern die neue Fassung des vorhandenen.
 */
export function create(input: CreateDocumentInput): ProjectDocument {
  const title = input.title.trim()
  const existing = findDocumentByTitle(input.projectId, title)

  if (existing) {
    const document = updateDocument(existing.id, {
      content: input.content ?? '',
      updatedByAgentId: input.createdByAgentId ?? null,
    })
    notify(document, 'updated')
    return document
  }

  const document = createDocument({ ...input, title })
  notify(document, 'created')
  log.info('Dokument angelegt', { id: document.id, title: document.title })
  return document
}

export function update(id: string, patch: UpdateDocumentInput): ProjectDocument {
  const current = getDocument(id)
  if (!current) throw new Error(`Dokument ${id} existiert nicht`)

  const title = patch.title?.trim()
  if (title && title.toLowerCase() !== current.title.toLowerCase()) {
    const clash = findDocumentByTitle(current.projectId, title)
    if (clash && clash.id !== id) {
      throw new Error(`In diesem Projekt gibt es bereits ein Dokument "${title}".`)
    }
  }

  const document = updateDocument(id, { ...patch, title })
  notify(document, 'updated')
  return document
}

export function remove(id: string): void {
  const document = getDocument(id)
  deleteDocument(id)
  if (document) notify(document, 'removed')
}

/** Speichert unter einem Titel — der Einstieg für Agenten über das MCP-Werkzeug. */
export function save(input: {
  projectId: string
  title: string
  content: string
  agentId?: string | null
}): ProjectDocument {
  return create({
    projectId: input.projectId,
    title: input.title,
    content: input.content,
    createdByAgentId: input.agentId ?? null,
  })
}

function notify(document: ProjectDocument, action: 'created' | 'updated' | 'removed'): void {
  emitEvent('document.changed', {
    projectId: document.projectId,
    documentId: document.id,
    action,
  })
}

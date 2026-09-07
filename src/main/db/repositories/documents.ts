import { getDb, nowIso } from '../connection'
import { buildUpdate, newId } from '../utils'
import type { ProjectDocument } from '@shared/types'

interface DocumentRow {
  id: string
  project_id: string
  title: string
  content: string
  created_by_agent_id: string | null
  updated_by_agent_id: string | null
  created_at: string
  updated_at: string
}

function toDocument(row: DocumentRow): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    createdByAgentId: row.created_by_agent_id,
    updatedByAgentId: row.updated_by_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listDocuments(projectId: string): ProjectDocument[] {
  return getDb()
    .prepare<[string], DocumentRow>(
      'SELECT * FROM documents WHERE project_id = ? ORDER BY updated_at DESC',
    )
    .all(projectId)
    .map(toDocument)
}

export function getDocument(id: string): ProjectDocument | null {
  const row = getDb().prepare<[string], DocumentRow>('SELECT * FROM documents WHERE id = ?').get(id)
  return row ? toDocument(row) : null
}

export function findDocumentByTitle(projectId: string, title: string): ProjectDocument | null {
  const row = getDb()
    .prepare<[string, string], DocumentRow>(
      'SELECT * FROM documents WHERE project_id = ? AND title = ? COLLATE NOCASE',
    )
    .get(projectId, title)
  return row ? toDocument(row) : null
}

export interface CreateDocumentInput {
  projectId: string
  title: string
  content?: string
  createdByAgentId?: string | null
}

export function createDocument(input: CreateDocumentInput): ProjectDocument {
  const id = newId()
  const now = nowIso()
  getDb()
    .prepare(
      `INSERT INTO documents (id, project_id, title, content, created_by_agent_id,
                              updated_by_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.title,
      input.content ?? '',
      input.createdByAgentId ?? null,
      input.createdByAgentId ?? null,
      now,
      now,
    )
  return getDocument(id)!
}

export interface UpdateDocumentInput {
  title?: string
  content?: string
  updatedByAgentId?: string | null
}

export function updateDocument(id: string, patch: UpdateDocumentInput): ProjectDocument {
  const { clause, values } = buildUpdate({
    title: patch.title,
    content: patch.content,
    updated_by_agent_id: patch.updatedByAgentId,
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE documents SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const document = getDocument(id)
  if (!document) throw new Error(`Dokument ${id} existiert nicht`)
  return document
}

export function deleteDocument(id: string): void {
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
}

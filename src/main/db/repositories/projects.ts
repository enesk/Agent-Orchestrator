import { getDb, nowIso } from '../connection'
import { buildUpdate, newId, parseJsonObject, toJson } from '../utils'
import type { JsonObject, Project } from '@shared/types'

interface ProjectRow {
  id: string
  name: string
  description: string | null
  path: string | null
  metadata: string
  created_at: string
  updated_at: string
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    path: row.path,
    metadata: parseJsonObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreateProjectInput {
  name: string
  description?: string | null
  path?: string | null
  metadata?: JsonObject
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  path?: string | null
  metadata?: JsonObject
}

export function listProjects(): Project[] {
  return getDb()
    .prepare<[], ProjectRow>('SELECT * FROM projects ORDER BY name COLLATE NOCASE')
    .all()
    .map(toProject)
}

export function getProject(id: string): Project | null {
  const row = getDb()
    .prepare<[string], ProjectRow>('SELECT * FROM projects WHERE id = ?')
    .get(id)
  return row ? toProject(row) : null
}

export function createProject(input: CreateProjectInput): Project {
  const id = newId()
  const now = nowIso()
  getDb()
    .prepare(
      `INSERT INTO projects (id, name, description, path, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.description ?? null,
      input.path ?? null,
      toJson(input.metadata ?? {}),
      now,
      now,
    )
  return getProject(id)!
}

export function updateProject(id: string, patch: UpdateProjectInput): Project {
  const { clause, values } = buildUpdate({
    name: patch.name,
    description: patch.description,
    path: patch.path,
    metadata: patch.metadata === undefined ? undefined : toJson(patch.metadata),
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE projects SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const project = getProject(id)
  if (!project) throw new Error(`Projekt ${id} existiert nicht`)
  return project
}

export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

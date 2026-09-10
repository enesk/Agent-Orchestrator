import { statSync } from 'node:fs'
import { dialog } from 'electron'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../db/repositories/projects'
import { deleteSessionsForProject } from '../db/repositories/sessions'
import { scopedLogger } from '../Logger'
import type { Project } from '@shared/types'
import { mainT } from '../app/settings'

const log = scopedLogger('projects')

/** Projekt plus Hinweis, falls der Pfad nicht (mehr) als Verzeichnis existiert. */
export interface ProjectSaveResult extends Project {
  pathWarning: string | null
}

export function list(): Project[] {
  return listProjects()
}

export function get(id: string): Project | null {
  return getProject(id)
}

export function create(input: CreateProjectInput): ProjectSaveResult {
  const project = createProject(input)
  log.info('Projekt angelegt', { id: project.id, name: project.name })
  return withPathWarning(project)
}

export function update(id: string, patch: UpdateProjectInput): ProjectSaveResult {
  const project = updateProject(id, patch)
  return withPathWarning(project)
}

export function remove(id: string): void {
  // Die Tabellen hängen per FK am Projekt; nur die CLI-Sessions stehen daneben.
  deleteSessionsForProject(id)
  deleteProject(id)
  log.info('Projekt gelöscht', { id })
}

export async function pickPath(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: mainT()('main.dialog.pickProjectTitle'),
    buttonLabel: mainT()('main.dialog.pickProjectButton'),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0] ?? null
}

/**
 * Prüft den Projektpfad, ohne das Speichern zu blockieren — ein Repo kann später
 * ausgecheckt werden, und ein fehlender Ordner darf das Projekt nicht unbrauchbar machen.
 */
export function checkPath(path: string | null): string | null {
  const t = mainT()
  if (!path || path.trim().length === 0) return t('main.path.missing')
  try {
    if (!statSync(path).isDirectory()) return t('main.path.notDirectory', { path })
  } catch {
    return t('main.path.notFound', { path })
  }
  return null
}

function withPathWarning(project: Project): ProjectSaveResult {
  return { ...project, pathWarning: checkPath(project.path) }
}

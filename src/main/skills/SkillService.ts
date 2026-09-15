import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, dialog } from 'electron'
import {
  createSkill,
  createSkillWithFiles,
  deleteSkill,
  getSkill,
  getSkillBySlug,
  listAgentIdsForSkill,
  listSkills,
  updateSkill,
} from '../db/repositories/skills'
import {
  deleteSkillFile,
  getSkillFile,
  hasSkillFilePath,
  insertSkillFile,
} from '../db/repositories/skillFiles'
import { deleteSessionsForAgent } from '../db/repositories/sessions'
import { mainT } from '../app/settings'
import { getMainWindow } from '../app/window'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import { baseSkillSlug } from '@shared/skillSlug'
import type { Skill, SkillImportPreview } from '@shared/types'
import {
  normalizeRelPath,
  parseSkillUpload,
  renderSkillMarkdown,
  SKILL_ARCHIVE_MAX_BYTES,
  SKILL_FILE_MAX_BYTES,
  SKILL_MAIN_FILE,
  SKILL_MAX_FILES,
  SKILL_TOTAL_MAX_BYTES,
  SkillImportError,
  type ParsedSkill,
} from './skillPackage'
import {
  removeSkillFileFromDisk,
  removeSkillFilesDir,
  skillFilePath,
  writeSkillFiles,
} from './SkillFileStore'
import { writeZip } from './zip'

const log = scopedLogger('skills')

/** Wie lange ein gelesener Import auf Bestätigung wartet, bevor er verworfen wird. */
const PENDING_IMPORT_TTL_MS = 30 * 60 * 1000
const MAX_PENDING_IMPORTS = 5

const pendingImports = new Map<string, { parsed: ParsedSkill; createdAt: number }>()

export function list(): Skill[] {
  return listSkills()
}

export function create(input: {
  name: string
  slug?: string
  description?: string
  content?: string
}): Skill {
  const skill = createSkill({
    name: input.name.trim(),
    slug: normalizeSkillSlug(input.slug?.trim() || input.name),
    description: input.description?.trim() ?? '',
    content: input.content ?? '',
  })
  emitEvent('skill.changed', { skillId: skill.id, action: 'created' })
  log.info('Skill angelegt', { id: skill.id, slug: skill.slug })
  return skill
}

export function update(
  id: string,
  patch: { name?: string; slug?: string; description?: string; content?: string },
): Skill {
  const skill = updateSkill(id, {
    name: patch.name?.trim(),
    slug: patch.slug === undefined ? undefined : normalizeSkillSlug(patch.slug, id),
    description: patch.description?.trim(),
    content: patch.content,
  })
  resetSessions(listAgentIdsForSkill(id))
  emitEvent('skill.changed', { skillId: skill.id, action: 'updated' })
  return skill
}

/** Die Zuordnungen fallen per Fremdschlüssel mit — betroffene Agenten erfahren es per Ereignis. */
export function remove(id: string): void {
  const agentIds = listAgentIdsForSkill(id)
  deleteSkill(id)
  removeSkillFilesDir(id)
  resetSessions(agentIds)
  emitEvent('skill.changed', { skillId: id, action: 'removed' })
  for (const agentId of agentIds) {
    emitEvent('agent.changed', { agentId, projectId: null, action: 'updated' })
  }
  log.info('Skill gelöscht', { id, agents: agentIds.length })
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Liest die Datei und merkt sich das Ergebnis — gespeichert wird erst nach Bestätigung. */
export function previewImport(input: { fileName: string; dataBase64: string }): SkillImportPreview {
  const parsed = withImportErrors(() =>
    parseSkillUpload(input.fileName, decodeUpload(input.dataBase64, SKILL_ARCHIVE_MAX_BYTES)),
  )

  prunePendingImports()
  const token = randomUUID()
  pendingImports.set(token, { parsed, createdAt: Date.now() })

  return {
    token,
    name: parsed.name,
    slug: normalizeSkillSlug(parsed.slugSource),
    description: parsed.description,
    contentLength: parsed.content.length,
    files: parsed.files.map((file) => ({ relPath: file.relPath, size: file.data.length })),
  }
}

export function confirmImport(input: { token: string; name: string; slug?: string }): Skill {
  const pending = pendingImports.get(input.token)
  if (!pending) throw new Error(mainT()('main.skillImport.expired'))
  const { parsed } = pending
  const name = input.name.trim() || parsed.name

  let createdId: string | null = null
  try {
    const skill = createSkillWithFiles(
      {
        name,
        // Zwischen Vorschau und Bestätigung kann ein gleichnamiger Skill entstanden sein.
        slug: normalizeSkillSlug(input.slug?.trim() || parsed.slugSource),
        description: parsed.description,
        content: parsed.content,
      },
      parsed.files.map((file) => ({ relPath: file.relPath, size: file.data.length })),
      (skillId) => {
        createdId = skillId
        writeSkillFiles(skillId, parsed.files)
      },
    )
    pendingImports.delete(input.token)
    emitEvent('skill.changed', { skillId: skill.id, action: 'created' })
    log.info('Skill importiert', { id: skill.id, slug: skill.slug, files: skill.files.length })
    return skill
  } catch (error) {
    // Die Transaktion ist zurückgerollt — halb geschriebene Dateien dürfen nicht liegen bleiben.
    if (createdId) removeSkillFilesDir(createdId)
    throw error
  }
}

export function discardImport(token: string): void {
  pendingImports.delete(token)
}

function prunePendingImports(): void {
  const now = Date.now()
  for (const [token, pending] of pendingImports) {
    if (now - pending.createdAt > PENDING_IMPORT_TTL_MS) pendingImports.delete(token)
  }
  // Map behält die Einfügereihenfolge — die ältesten fliegen zuerst.
  while (pendingImports.size >= MAX_PENDING_IMPORTS) {
    pendingImports.delete(pendingImports.keys().next().value!)
  }
}

// ---------------------------------------------------------------------------
// Beidateien
// ---------------------------------------------------------------------------

export function addFile(input: { skillId: string; relPath: string; dataBase64: string }): Skill {
  const t = mainT()
  const skill = getSkill(input.skillId)
  if (!skill) throw new Error(t('main.error.skillGone'))

  const relPath = normalizeRelPath(input.relPath)
  if (!relPath) throw new Error(t('main.skillImport.invalidPath', { path: input.relPath }))
  if (hasSkillFilePath(skill.id, relPath)) {
    throw new Error(t('main.skillImport.pathExists', { path: relPath }))
  }

  const data = withImportErrors(() => decodeUpload(input.dataBase64, SKILL_FILE_MAX_BYTES))
  if (data.length === 0) throw new Error(t('main.skillImport.emptyFile', { path: relPath }))
  if (skill.files.length >= SKILL_MAX_FILES - 1) {
    throw new Error(t('main.skillImport.tooManyFiles', { count: SKILL_MAX_FILES }))
  }
  const used = skill.content.length + skill.files.reduce((sum, file) => sum + file.size, 0)
  if (used + data.length > SKILL_TOTAL_MAX_BYTES) {
    throw new Error(t('main.skillImport.totalTooLarge'))
  }

  writeSkillFiles(skill.id, [{ relPath, data }])
  try {
    insertSkillFile(skill.id, relPath, data.length)
  } catch (error) {
    removeSkillFileFromDisk(skill.id, relPath)
    throw error
  }
  return afterFilesChanged(skill.id)
}

export function removeFile(input: { skillId: string; fileId: string }): Skill {
  const file = getSkillFile(input.skillId, input.fileId)
  if (!file) throw new Error(mainT()('main.error.skillFileGone'))
  deleteSkillFile(input.skillId, file.id)
  removeSkillFileFromDisk(input.skillId, file.relPath)
  return afterFilesChanged(input.skillId)
}

/** Beidateien ändern, was Claude lesen kann — fortgesetzte Sessions kennen den alten Stand. */
function afterFilesChanged(skillId: string): Skill {
  const skill = getSkill(skillId)
  if (!skill) throw new Error(mainT()('main.error.skillGone'))
  resetSessions(listAgentIdsForSkill(skillId))
  emitEvent('skill.changed', { skillId, action: 'updated' })
  return skill
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Packt `<slug>/SKILL.md` und die Beidateien in ein Archiv. Der Ordner im Archiv trägt den
 * Slug, damit ein erneuter Import denselben Slug vorschlägt.
 */
export async function exportSkill(id: string): Promise<{ path: string | null }> {
  const t = mainT()
  const skill = getSkill(id)
  if (!skill) throw new Error(t('main.error.skillGone'))

  const options: Electron.SaveDialogOptions = {
    title: t('main.dialog.exportSkillTitle'),
    buttonLabel: t('main.dialog.exportSkillButton'),
    defaultPath: path.join(app.getPath('downloads'), `${skill.slug}.zip`),
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  }
  const window = getMainWindow()
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { path: null }

  const markdown = renderSkillMarkdown({
    name: skill.name,
    // Ohne Beschreibung ließe sich das Archiv nicht wieder importieren — wie im Plugin-Ordner.
    description: skill.description.trim() || skill.name,
    content: skill.content,
  })
  const archive = writeZip([
    { path: `${skill.slug}/${SKILL_MAIN_FILE}`, data: Buffer.from(markdown, 'utf8') },
    ...skill.files.map((file) => ({
      path: `${skill.slug}/${file.relPath}`,
      data: readFileSync(skillFilePath(skill.id, file.relPath)),
    })),
  ])
  writeFileSync(result.filePath, archive)
  log.info('Skill exportiert', { id: skill.id, path: result.filePath, files: skill.files.length })
  return { path: result.filePath }
}

// ---------------------------------------------------------------------------

function decodeUpload(dataBase64: string, maxBytes: number): Buffer {
  // Vor dem Dekodieren prüfen: Base64 ist ein Drittel größer als die Daten.
  if (Math.floor((dataBase64.length * 3) / 4) > maxBytes + 3) {
    throw new SkillImportError(
      maxBytes === SKILL_FILE_MAX_BYTES ? 'main.skillImport.uploadTooLarge' : 'main.skillImport.archiveTooLarge',
    )
  }
  return Buffer.from(dataBase64, 'base64')
}

function withImportErrors<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof SkillImportError) {
      log.warn('Skill-Import abgelehnt', { reason: error.key, ...error.params })
      throw new Error(mainT()(error.key, error.params))
    }
    throw error
  }
}

/**
 * Slugs sind Verzeichnis- und Aufrufname: klein, nur `[a-z0-9-]`, global eindeutig — bei
 * Kollision wird ein Zähler angehängt. Gleiche Normalisierung wie `normalizeMentionKey`,
 * nur mit Bindestrich statt ohne Trenner, damit mehrteilige Namen lesbar bleiben.
 */
export function normalizeSkillSlug(raw: string, excludeSkillId?: string): string {
  const base = baseSkillSlug(raw)

  let candidate = base
  let counter = 2
  while (isTaken(candidate, excludeSkillId)) {
    candidate = `${base}-${counter}`
    counter += 1
  }
  return candidate
}

/**
 * Hat ein Agent den Skill in einer fortgesetzten Session schon geladen, steht der alte Inhalt
 * im Transkript und wirkt weiter. Erst ein Kaltstart zeigt Claude den neuen Stand.
 */
function resetSessions(agentIds: readonly string[]): void {
  for (const agentId of agentIds) deleteSessionsForAgent(agentId)
}

function isTaken(slug: string, excludeSkillId?: string): boolean {
  const owner = getSkillBySlug(slug)
  return owner !== null && owner.id !== excludeSkillId
}

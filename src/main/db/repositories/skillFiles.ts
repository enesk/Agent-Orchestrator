import { getDb, nowIso } from '../connection'
import { newId } from '../utils'
import type { SkillFile } from '@shared/types'

interface SkillFileRow {
  id: string
  skill_id: string
  rel_path: string
  size: number
  created_at: string
}

function toSkillFile(row: SkillFileRow): SkillFile {
  return {
    id: row.id,
    relPath: row.rel_path,
    size: row.size,
    createdAt: row.created_at,
  }
}

export function getSkillFile(skillId: string, fileId: string): SkillFile | null {
  const row = getDb()
    .prepare<[string, string], SkillFileRow>(
      'SELECT * FROM skill_files WHERE skill_id = ? AND id = ?',
    )
    .get(skillId, fileId)
  return row ? toSkillFile(row) : null
}

/** Vergleicht ohne Schreibweise — auf der Platte (macOS) wären beide Pfade dieselbe Datei. */
export function hasSkillFilePath(skillId: string, relPath: string): boolean {
  const row = getDb()
    .prepare<[string, string], { id: string }>(
      'SELECT id FROM skill_files WHERE skill_id = ? AND lower(rel_path) = lower(?)',
    )
    .get(skillId, relPath)
  return row !== undefined
}

export function insertSkillFile(skillId: string, relPath: string, size: number): SkillFile {
  const id = newId()
  getDb()
    .prepare(
      `INSERT INTO skill_files (id, skill_id, rel_path, size, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, skillId, relPath, size, nowIso())
  return getSkillFile(skillId, id)!
}

export function deleteSkillFile(skillId: string, fileId: string): void {
  getDb().prepare('DELETE FROM skill_files WHERE skill_id = ? AND id = ?').run(skillId, fileId)
}

import { getDb, nowIso } from '../connection'
import { buildUpdate, newId } from '../utils'
import type { Skill, SkillFile } from '@shared/types'

interface SkillRow {
  id: string
  name: string
  slug: string
  description: string
  content: string
  /** JSON-Array aus der Unterabfrage in `SKILL_COLUMNS`. */
  files_json: string | null
  created_at: string
  updated_at: string
}

const SKILL_COLUMNS = `s.*,
  (SELECT json_group_array(json_object(
            'id', f.id, 'relPath', f.rel_path, 'size', f.size, 'createdAt', f.created_at))
     FROM skill_files f WHERE f.skill_id = s.id) AS files_json`

function parseFiles(raw: string | null): SkillFile[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as SkillFile[]
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => a.relPath.localeCompare(b.relPath))
      : []
  } catch {
    return []
  }
}

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    content: row.content,
    files: parseFiles(row.files_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreateSkillInput {
  name: string
  slug: string
  description?: string
  content?: string
}

export interface UpdateSkillInput {
  name?: string
  slug?: string
  description?: string
  content?: string
}

export function listSkills(): Skill[] {
  return getDb()
    .prepare<[], SkillRow>(`SELECT ${SKILL_COLUMNS} FROM skills s ORDER BY s.name COLLATE NOCASE`)
    .all()
    .map(toSkill)
}

export function getSkill(id: string): Skill | null {
  const row = getDb()
    .prepare<[string], SkillRow>(`SELECT ${SKILL_COLUMNS} FROM skills s WHERE s.id = ?`)
    .get(id)
  return row ? toSkill(row) : null
}

export function getSkillBySlug(slug: string): Skill | null {
  const row = getDb()
    .prepare<[string], SkillRow>(`SELECT ${SKILL_COLUMNS} FROM skills s WHERE s.slug = ?`)
    .get(slug)
  return row ? toSkill(row) : null
}

/** Die Skills eines Agenten in stabiler Reihenfolge — die Grundlage seines Plugin-Ordners. */
export function listSkillsForAgent(agentId: string): Skill[] {
  return getDb()
    .prepare<[string], SkillRow>(
      `SELECT ${SKILL_COLUMNS} FROM agent_skills ask
         JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = ?
        ORDER BY s.slug`,
    )
    .all(agentId)
    .map(toSkill)
}

/** Agenten, denen der Skill zugewiesen ist — für Ereignisse nach dem Löschen. */
export function listAgentIdsForSkill(skillId: string): string[] {
  return getDb()
    .prepare<[string], { agent_id: string }>(
      'SELECT agent_id FROM agent_skills WHERE skill_id = ?',
    )
    .all(skillId)
    .map((row) => row.agent_id)
}

export function createSkill(input: CreateSkillInput): Skill {
  const id = newId()
  const now = nowIso()
  getDb()
    .prepare(
      `INSERT INTO skills (id, name, slug, description, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.slug, input.description ?? '', input.content ?? '', now, now)
  return getSkill(id)!
}

/**
 * Legt Skill und Beidatei-Zeilen in einer Transaktion an. `writeFiles` läuft innerhalb der
 * Transaktion — wirft es, gibt es auch keinen Skill ohne seine Dateien.
 */
export function createSkillWithFiles(
  input: CreateSkillInput,
  files: readonly { relPath: string; size: number }[],
  writeFiles: (skillId: string) => void,
): Skill {
  const db = getDb()
  const id = db.transaction(() => {
    const skill = createSkill(input)
    const insert = db.prepare(
      `INSERT INTO skill_files (id, skill_id, rel_path, size, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const now = nowIso()
    for (const file of files) insert.run(newId(), skill.id, file.relPath, file.size, now)
    writeFiles(skill.id)
    return skill.id
  })()
  return getSkill(id)!
}

export function updateSkill(id: string, patch: UpdateSkillInput): Skill {
  const { clause, values } = buildUpdate({
    name: patch.name,
    slug: patch.slug,
    description: patch.description,
    content: patch.content,
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE skills SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const skill = getSkill(id)
  if (!skill) throw new Error(`Skill ${id} existiert nicht`)
  return skill
}

export function deleteSkill(id: string): void {
  getDb().prepare('DELETE FROM skills WHERE id = ?').run(id)
}

import { getDb, nowIso } from '../connection'
import { buildUpdate, newId } from '../utils'
import type { Skill } from '@shared/types'

interface SkillRow {
  id: string
  name: string
  slug: string
  description: string
  content: string
  created_at: string
  updated_at: string
}

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    content: row.content,
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
    .prepare<[], SkillRow>('SELECT * FROM skills ORDER BY name COLLATE NOCASE')
    .all()
    .map(toSkill)
}

export function getSkill(id: string): Skill | null {
  const row = getDb().prepare<[string], SkillRow>('SELECT * FROM skills WHERE id = ?').get(id)
  return row ? toSkill(row) : null
}

export function getSkillBySlug(slug: string): Skill | null {
  const row = getDb()
    .prepare<[string], SkillRow>('SELECT * FROM skills WHERE slug = ?')
    .get(slug)
  return row ? toSkill(row) : null
}

/** Die Skills eines Agenten in stabiler Reihenfolge — die Grundlage seines Plugin-Ordners. */
export function listSkillsForAgent(agentId: string): Skill[] {
  return getDb()
    .prepare<[string], SkillRow>(
      `SELECT s.* FROM agent_skills ask
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

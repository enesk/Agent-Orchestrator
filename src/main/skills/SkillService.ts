import {
  createSkill,
  deleteSkill,
  getSkillBySlug,
  listAgentIdsForSkill,
  listSkills,
  updateSkill,
} from '../db/repositories/skills'
import { deleteSessionsForAgent } from '../db/repositories/sessions'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import { baseSkillSlug } from '@shared/skillSlug'
import type { Skill } from '@shared/types'

const log = scopedLogger('skills')

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
  resetSessions(agentIds)
  emitEvent('skill.changed', { skillId: id, action: 'removed' })
  for (const agentId of agentIds) {
    emitEvent('agent.changed', { agentId, projectId: null, action: 'updated' })
  }
  log.info('Skill gelöscht', { id, agents: agentIds.length })
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

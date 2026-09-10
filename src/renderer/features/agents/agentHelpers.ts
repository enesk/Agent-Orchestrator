import { AGENT_MODELS, type AgentEffort, type AgentRole } from '@shared/constants'
import type { TranslationKey } from '@shared/i18n'

/**
 * Vorschau der Normalisierung, die der Main-Prozess vornimmt. Die Eindeutigkeit prüft
 * dort `AgentService.normalizeMentionKey` — bei Kollision hängt er eine Zahl an.
 */
export function previewMentionKey(raw: string): string {
  const base =
    raw
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || 'agent'
  return `@${base}`
}

export function roleLabelKey(role: AgentRole): TranslationKey {
  return `agent.role.${role}`
}

export function roleDescriptionKey(role: AgentRole): TranslationKey {
  return `agent.role.${role}.description`
}

/** Kurzform des Modells für Listen — freie IDs werden unverändert gezeigt. */
export function modelLabel(model: string): string {
  return AGENT_MODELS.find((option) => option.value === model)?.label ?? model
}

export function effortLabelKey(effort: AgentEffort): TranslationKey {
  return `agent.effort.${effort}`
}

/** Zwei Buchstaben aus dem Namen, wenn kein Avatar hinterlegt ist. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
}

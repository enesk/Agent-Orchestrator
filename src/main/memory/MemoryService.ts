import {
  clearMemories,
  deleteMemories,
  deleteMemory,
  listMemories,
  saveMemory,
  searchMemories,
  touchMemories,
  type MemoryFilter,
  type SaveMemoryInput,
} from '../db/repositories/memories'
import { buildMemoryIndex } from '@shared/memoryIndex'
import type { AgentMemory } from '@shared/types'

/** So viele Treffer liefert `memory_search`, wenn der Agent nichts anderes verlangt. */
export const SEARCH_DEFAULT_LIMIT = 5

/** Der Einstieg über dem Verzeichnis — er muss den Agenten zum Nachschlagen bringen. */
const INDEX_INTRO = [
  'Du hast ein Langzeitgedächtnis zu diesem Projekt. Unten stehen nur die Stichwörter deiner',
  'Einträge, nicht ihr Inhalt. Berührt die Aufgabe eines dieser Stichwörter, hole den Inhalt',
  'mit `memory_get` (Schlüssel angeben), bevor du antwortest oder handelst — rate nicht aus dem',
  'Stichwort. Findest du kein passendes Stichwort, glaubst aber, dass du es schon einmal wusstest,',
  'suche mit `memory_search`. Hat die Aufgabe nichts damit zu tun, schlage nichts nach.',
].join('\n')

export function list(filter: MemoryFilter = {}): AgentMemory[] {
  return listMemories(filter)
}

export function save(input: SaveMemoryInput): AgentMemory {
  return saveMemory(input)
}

export function remove(id: number): void {
  deleteMemory(id)
}

export function removeMany(ids: readonly number[]): number {
  return deleteMemories(ids)
}

export function clear(filter: MemoryFilter = {}): number {
  return clearMemories(filter)
}

/**
 * Das Gedächtnis im Prompt: eine kurze Erklärung und das Schlüsselverzeichnis, keine Werte.
 * Leerer String, wenn der Agent nichts gespeichert hat. Zählt keinen Zugriff — gelesen ist
 * erst, was über `memory_get` oder `memory_search` abgerufen wird.
 */
export function buildPromptIndex(agentId: string, projectId: string | null): string {
  const memories = listMemories({ agentId, projectId })
  if (memories.length === 0) return ''
  return `${INDEX_INTRO}\n\n${buildMemoryIndex(memories).text}`
}

export interface KeyLookup {
  found: AgentMemory[]
  missing: string[]
}

/** Volle Werte zu genannten Schlüsseln; projektbezogene gehen globalen desselben Schlüssels vor. */
export function getByKeys(agentId: string, projectId: string | null, keys: readonly string[]): KeyLookup {
  const memories = listMemories({ agentId, projectId })
  const found: AgentMemory[] = []
  const missing: string[] = []
  for (const key of new Set(keys.map((entry) => entry.trim()).filter(Boolean))) {
    const match =
      memories.find((memory) => memory.key === key && memory.projectId === projectId) ??
      memories.find((memory) => memory.key === key) ??
      // Agenten tippen Schlüssel gern mit anderer Groß-/Kleinschreibung ab.
      memories.find((memory) => memory.key.toLowerCase() === key.toLowerCase())
    if (match) {
      if (!found.includes(match)) found.push(match)
    } else {
      missing.push(key)
    }
  }
  touchMemories(found.map((memory) => memory.id))
  return { found, missing }
}

/**
 * Schlichte Volltextsuche: jedes Suchwort zählt im Schlüssel dreifach, im Wert einfach;
 * bei Gleichstand gewinnt die Wichtigkeit, danach die jüngere Fassung.
 */
export function search(
  agentId: string,
  projectId: string | null,
  query: string,
  limit = SEARCH_DEFAULT_LIMIT,
): AgentMemory[] {
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1))]
  if (terms.length === 0) return []

  const scored = searchMemories({ agentId, projectId }, terms).map((memory) => {
    const key = memory.key.toLowerCase()
    const value = memory.value.toLowerCase()
    const score = terms.reduce(
      (sum, term) => sum + (key.includes(term) ? 3 : 0) + (value.includes(term) ? 1 : 0),
      0,
    )
    return { memory, score }
  })
  // listMemories sortiert bereits nach Wichtigkeit und Aktualität; sort ist stabil.
  const hits = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance)
    .slice(0, limit)
    .map((entry) => entry.memory)
  touchMemories(hits.map((memory) => memory.id))
  return hits
}

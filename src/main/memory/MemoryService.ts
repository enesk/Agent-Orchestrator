import {
  clearMemories,
  deleteMemory,
  listMemories,
  saveMemory,
  touchMemories,
  type MemoryFilter,
  type SaveMemoryInput,
} from '../db/repositories/memories'
import type { AgentMemory } from '@shared/types'

/** So viele Erinnerungen passen in einen Prompt, ohne ihn zu überfrachten. */
const PROMPT_MEMORY_LIMIT = 30

const IMPORTANCE_LABELS: Record<number, string> = {
  3: 'HOCH',
  2: 'MITTEL',
  1: 'NIEDRIG',
}

export function list(filter: MemoryFilter = {}): AgentMemory[] {
  return listMemories(filter)
}

export function save(input: SaveMemoryInput): AgentMemory {
  return saveMemory(input)
}

export function remove(id: number): void {
  deleteMemory(id)
}

export function clear(filter: MemoryFilter = {}): number {
  return clearMemories(filter)
}

/**
 * Die Erinnerungen, die in den Prompt gehören: projektbezogene und projektübergreifende
 * zusammen, die wichtigsten zuerst. Der Zugriff wird mitgezählt, damit später sichtbar ist,
 * was tatsächlich gebraucht wird.
 */
export function getForPrompt(
  agentId: string,
  projectId: string | null,
  limit = PROMPT_MEMORY_LIMIT,
): AgentMemory[] {
  const memories = listMemories({ agentId, projectId }).slice(0, limit)
  touchMemories(memories.map((memory) => memory.id))
  return memories
}

/** Kompakter Block für den Systemprompt; leerer String, wenn es nichts zu erinnern gibt. */
export function buildBlock(memories: readonly AgentMemory[]): string {
  if (memories.length === 0) return ''
  return memories
    .map((memory) => `[${IMPORTANCE_LABELS[memory.importance] ?? 'MITTEL'}] ${memory.key}: ${memory.value}`)
    .join('\n')
}

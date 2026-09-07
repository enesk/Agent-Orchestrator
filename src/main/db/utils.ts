import { randomUUID } from 'node:crypto'
import type { JsonObject } from '@shared/types'

export function newId(): string {
  return randomUUID()
}

export function parseJsonObject(raw: string | null | undefined): JsonObject {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : {}
  } catch {
    return {}
  }
}

export function parseNullableJsonObject(raw: string | null | undefined): JsonObject | null {
  if (raw === null || raw === undefined) return null
  return parseJsonObject(raw)
}

export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export function toBool(value: number | null | undefined): boolean {
  return value === 1
}

export function fromBool(value: boolean): number {
  return value ? 1 : 0
}

/**
 * Baut aus einem Patch-Objekt die `SET`-Klausel eines UPDATE. Felder mit `undefined`
 * werden übersprungen, damit "nicht mitgeschickt" und "auf null setzen" unterscheidbar bleiben.
 */
export function buildUpdate(
  columns: Record<string, unknown>,
): { clause: string; values: unknown[] } {
  const parts: string[] = []
  const values: unknown[] = []
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue
    parts.push(`${column} = ?`)
    values.push(value)
  }
  return { clause: parts.join(', '), values }
}

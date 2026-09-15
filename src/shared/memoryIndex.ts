/**
 * Das Schlüsselverzeichnis des Gedächtnisses: nur die Stichwörter, nach Wichtigkeit gruppiert.
 * Liegt in `shared`, weil der Prompt es baut und die Gedächtnis-Ansicht seine Größe anzeigt —
 * beide sollen dieselbe Zahl sehen.
 */

/** Sicherheitsnetz, damit das Verzeichnis nicht wieder so auswuchert wie früher der Block. */
export const MEMORY_INDEX_CHAR_LIMIT = 4_000

/** Obergrenze eines Werts, den ein Agent speichert — ein Fakt, kein Aufsatz. */
export const MEMORY_VALUE_CHAR_LIMIT = 1_000

const IMPORTANCE_LABELS: Record<number, string> = {
  3: 'HOCH',
  2: 'MITTEL',
  1: 'NIEDRIG',
}

export interface MemoryIndexEntry {
  key: string
  importance: number
}

export interface MemoryIndex {
  text: string
  /** Wie viele Schlüssel das Verzeichnis nennt bzw. wegen der Grenze weglässt. */
  shown: number
  omitted: number
}

/**
 * Erwartet die Einträge wichtigste zuerst. Doppelte Schlüssel (projektbezogen und global)
 * erscheinen nur einmal, mit der höheren Wichtigkeit. Übersteigt das Verzeichnis die Grenze,
 * fallen die hintersten — also unwichtigsten — Schlüssel weg.
 */
export function buildMemoryIndex(
  entries: readonly MemoryIndexEntry[],
  limit: number = MEMORY_INDEX_CHAR_LIMIT,
): MemoryIndex {
  const importanceByKey = new Map<string, number>()
  for (const entry of entries) {
    const known = importanceByKey.get(entry.key)
    if (known === undefined || entry.importance > known) importanceByKey.set(entry.key, entry.importance)
  }
  const unique = [...importanceByKey].map(([key, importance]) => ({ key, importance }))
  unique.sort((a, b) => b.importance - a.importance)

  let count = unique.length
  let text = render(unique, count)
  while (count > 0 && text.length > limit) {
    count -= 1
    text = render(unique, count)
  }
  return { text, shown: count, omitted: unique.length - count }
}

function render(entries: readonly MemoryIndexEntry[], count: number): string {
  const groups = new Map<number, string[]>()
  for (const entry of entries.slice(0, count)) {
    const keys = groups.get(entry.importance) ?? []
    keys.push(entry.key)
    groups.set(entry.importance, keys)
  }
  const lines = [...groups].map(
    ([importance, keys]) => `${IMPORTANCE_LABELS[importance] ?? 'MITTEL'}: ${keys.join(', ')}`,
  )
  const omitted = entries.length - count
  if (omitted > 0) lines.push(`… und ${omitted} weitere, mit \`memory_search\` auffindbar`)
  return lines.join('\n')
}

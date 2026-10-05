/**
 * Das Ablageformat der Header- und Umgebungswerte: ein JSON-Objekt Schlüssel → base64 des
 * Chiffrats. Die Schlüssel bleiben im Klartext, damit die Oberfläche sie anzeigen kann, ohne
 * entschlüsseln zu müssen. Ohne Electron, damit die Repositories es benutzen können.
 */

export type SecretMap = Record<string, string>

export function parseEnvelope(raw: string | null | undefined): SecretMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: SecretMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

/** Nur die Schlüssel — das braucht die Oberfläche, und mehr darf sie nicht bekommen. */
export function secretKeys(raw: string | null | undefined): string[] {
  return Object.keys(parseEnvelope(raw)).sort((a, b) => a.localeCompare(b))
}

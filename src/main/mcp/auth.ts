import { resolve, type RunContext } from './RunContextRegistry'

/**
 * Liest `Authorization: Bearer <token>`. Bewusst frei von Node-HTTP- und Electron-Typen,
 * damit sich die Token-Prüfung als reine Funktion testen lässt.
 */
export function extractBearerToken(header: string | string[] | undefined | null): string | null {
  if (header === null || header === undefined) return null
  const raw = Array.isArray(header) ? header[0] : header
  if (typeof raw !== 'string') return null

  const match = /^Bearer[ \t]+(\S+)$/i.exec(raw.trim())
  return match ? match[1]! : null
}

/**
 * Der einzige Weg in den Werkzeugserver: ohne gültiges Token gibt es keinen Kontext und
 * damit keinen Werkzeugaufruf.
 */
export function authorize(header: string | string[] | undefined | null): RunContext | null {
  return resolve(extractBearerToken(header))
}

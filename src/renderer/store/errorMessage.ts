/**
 * Fehler aus dem IPC-Vertrag sind Strings mit dem Kanalnamen davor. Für die Anzeige wird
 * nur die eigentliche Meldung gebraucht.
 */
export function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error: /, '').replace(/^Error invoking remote method '[^']*': /, '')
}

/**
 * Fehler aus dem IPC-Vertrag sind Strings mit dem Kanalnamen davor. Für die Anzeige wird
 * nur die eigentliche Meldung gebraucht.
 */
export function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  // Electron verpackt als `Error invoking remote method '…': Error: <Meldung>` — erst die Hülle, dann das Präfix.
  return raw.replace(/^Error invoking remote method '[^']*': /, '').replace(/^Error: /, '')
}

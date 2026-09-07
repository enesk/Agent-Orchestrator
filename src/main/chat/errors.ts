import { RateLimitError } from '../claude'

export interface RunFailure {
  code: string
  message: string
}

/**
 * Übersetzt einen Laufzeitfehler in etwas, das im Chat stehen kann. Die Ursachen sind
 * absichtlich grob: der Nutzer soll wissen, ob er warten, den Pfad prüfen oder die CLI
 * installieren muss.
 */
export function describeRunFailure(error: unknown): RunFailure {
  if (error instanceof RateLimitError) {
    return { code: 'rate_limit', message: error.message }
  }

  const message = error instanceof Error ? error.message : String(error)

  if (/nicht gestartet werden/i.test(message)) {
    return {
      code: 'cli_unavailable',
      message: `${message} Prüfe den Pfad zur Claude-CLI in den Einstellungen.`,
    }
  }
  if (/Projektpfad/i.test(message)) {
    return { code: 'project_path', message }
  }
  if (/nicht geantwortet/i.test(message)) {
    return { code: 'timeout', message }
  }
  if (/gespeicherte Claude-Session/i.test(message)) {
    return { code: 'session_lost', message }
  }
  if (/beendet/i.test(message)) {
    return { code: 'process_failed', message }
  }

  return { code: 'unknown', message: message || 'Der Agent hat nicht geantwortet.' }
}

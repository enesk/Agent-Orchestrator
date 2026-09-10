import { RateLimitError, RunError } from '../claude'
import { mainT } from '../app/settings'

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

  // Der Code kommt vom Werfenden, nicht aus einem Textmuster: die Meldungen stehen in der
  // eingestellten Sprache und ließen sich sonst nicht mehr einordnen.
  if (error instanceof RunError) {
    return { code: error.code, message: error.message }
  }

  const message = error instanceof Error ? error.message : String(error)
  return { code: 'unknown', message: message || mainT()('chat.message.noAnswer') }
}

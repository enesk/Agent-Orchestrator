import { ensureClaudeStatus, refreshClaudeStatus } from '../claude/status'
import type { DomainHandlers } from './registry'

export const claudeHandlers: DomainHandlers<'claude'> = {
  /** Gemerkter Status; beim ersten Aufruf wird er ermittelt. */
  status: () => ensureClaudeStatus(),

  /**
   * Erneute Suche. Ein mitgegebener Pfad wird bevorzugt geprüft — so kann die
   * Einstellungsseite einen Pfad testen, bevor er gespeichert wird.
   */
  detect: (input) => refreshClaudeStatus(input.path),
}

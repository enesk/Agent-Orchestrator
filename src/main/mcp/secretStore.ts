import { safeStorage } from 'electron'
import { mainT } from '../app/settings'
import { describeError, scopedLogger } from '../Logger'
import { parseEnvelope, type SecretMap } from './secretEnvelope'

const log = scopedLogger('mcp.secrets')

/**
 * Header- und Umgebungswerte externer MCP-Server. Bei einem Unity-Server auf localhost steht
 * dort nichts Geheimes, bei einem Server im Netz sehr wohl ein Token. Sie liegen deshalb von
 * Anfang an verschlüsselt — und `safeStorage` ist Pflicht: ohne benutzbaren Schlüsselbund wird
 * das Speichern abgelehnt, statt still Klartext in die Datenbank zu schreiben.
 */

export type { SecretMap }

export function isSecretStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Wirft mit sichtbarem Hinweis, wenn der Schlüsselbund nicht benutzbar ist. */
export function assertSecretStorage(): void {
  if (!isSecretStorageAvailable()) throw new Error(mainT()('main.error.mcpNoSafeStorage'))
}

export function encryptSecrets(values: SecretMap): string {
  const keys = Object.keys(values)
  if (keys.length === 0) return '{}'
  assertSecretStorage()
  const encoded: SecretMap = {}
  for (const key of keys) {
    encoded[key] = safeStorage.encryptString(values[key] ?? '').toString('base64')
  }
  return JSON.stringify(encoded)
}

/**
 * Entschlüsselt die Werte. Ein einzelner unlesbarer Eintrag (anderer Schlüsselbund, anderer
 * Rechner) wirft nicht, sondern fällt weg — sonst verhinderte ein alter Eintrag jeden Lauf des
 * Projekts. Der Aufrufer erfährt es über das Protokoll.
 */
export function decryptSecrets(raw: string | null | undefined): SecretMap {
  const stored = parseEnvelope(raw)
  const values: SecretMap = {}
  for (const [key, encoded] of Object.entries(stored)) {
    try {
      values[key] = safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch (error) {
      log.warn('Wert konnte nicht entschlüsselt werden', { key, ...describeError(error) })
    }
  }
  return values
}

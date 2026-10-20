import { safeStorage } from 'electron'
import { mainT } from '../app/settings'
import {
  clearPushCredentials,
  getStoredPushCredentials,
  savePushIds,
  savePushKey,
} from '../db/repositories/pushDevices'
import { describeError, scopedLogger } from '../Logger'
import { isSecretStorageAvailable } from '../mcp/secretStore'
import { ApnsKeyError, loadSigningKey, type ApnsCredentials } from './jwt'

const log = scopedLogger('push.keys')

/**
 * Der APNs-Schlüssel aus dem Developer-Konto: `.p8`, Key-ID und Team-ID. Alle drei liegen mit
 * `safeStorage` verschlüsselt in der Datenbank — der `.p8` kann für die Dauer seiner Existenz
 * jede Benachrichtigung an jede App des Teams schicken, im Klartext legt die App ihn nicht ab.
 *
 * Herausgeben tut dieses Modul die Werte **nur** an den Versender im Main-Prozess.
 * `src/main/ipc/push.ts` ruft ausschließlich `info()` auf, und die Verwaltungsmethoden stehen
 * in der `unsupported`-Liste der Brücke.
 */

export { isSecretStorageAvailable }

export interface CredentialsInfo {
  hasKey: boolean
  hasKeyId: boolean
  hasTeamId: boolean
  keyFileName: string | null
}

export function assertSecretStorage(): void {
  if (!isSecretStorageAvailable()) throw new Error(mainT()('main.push.noSafeStorage'))
}

function encrypt(value: string): string {
  return safeStorage.encryptString(value).toString('base64')
}

function decrypt(encoded: string | null): string | null {
  if (encoded === null || encoded === '') return null
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch (error) {
    // Anderer Rechner, anderer Schlüsselbund: der Wert ist verloren, aber das ist kein Grund,
    // die App anzuhalten. Der Versand scheitert danach mit „kein Schlüssel".
    log.warn('Wert konnte nicht entschlüsselt werden', describeError(error))
    return null
  }
}

/** Was die Oberfläche erfahren darf: ob etwas hinterlegt ist, nicht was. */
export function info(): CredentialsInfo {
  const stored = getStoredPushCredentials()
  return {
    hasKey: stored.keyP8 !== null && stored.keyP8 !== '',
    hasKeyId: stored.keyId !== null && stored.keyId !== '',
    hasTeamId: stored.teamId !== null && stored.teamId !== '',
    keyFileName: stored.keyFileName,
  }
}

/** Die entschlüsselten Werte für den Versender. Verlässt den Main-Prozess nicht. */
export function credentials(): ApnsCredentials | null {
  const stored = getStoredPushCredentials()
  const p8 = decrypt(stored.keyP8)
  const keyId = decrypt(stored.keyId)
  const teamId = decrypt(stored.teamId)
  if (!p8 || !keyId || !teamId) return null
  return { p8, keyId, teamId }
}

/**
 * Hinterlegt den `.p8`-Schlüssel. Geprüft wird **vor** dem Speichern: ein Zertifikat, ein
 * RSA-Schlüssel oder eine verschlüsselte Datei wird abgelehnt, statt später bei jeder Meldung
 * ein `403 InvalidProviderToken` von Apple zu holen.
 */
export function setKey(p8: string, fileName: string | null): void {
  assertSecretStorage()

  const trimmed = p8.trim()
  const t = mainT()
  loadSigningKey(trimmed, {
    notAKey: t('main.push.keyNotAKey'),
    wrongCurve: t('main.push.keyWrongCurve'),
  })

  savePushKey({ keyP8: encrypt(trimmed), keyFileName: fileName?.trim() || null })
  log.info('APNs-Schlüssel hinterlegt', { keyFileName: fileName ?? 'ohne Dateinamen' })
}

/** Key-ID und Team-ID. Beide sind keine Geheimnisse im engen Sinn, liegen aber mit. */
export function setIds(keyId: string, teamId: string): void {
  assertSecretStorage()

  const id = keyId.trim()
  const team = teamId.trim()
  if (id === '' || team === '') throw new ApnsKeyError(mainT()('main.push.idsMissing'))

  savePushIds({ keyId: encrypt(id), teamId: encrypt(team) })
  log.info('Key-ID und Team-ID hinterlegt')
}

export function clear(): void {
  clearPushCredentials()
  log.info('APNs-Schlüssel entfernt')
}

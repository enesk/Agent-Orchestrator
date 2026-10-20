import { getDb, nowIso } from '../connection'
import type { PushDevice, PushEnvironment } from '@shared/types'

interface PushDeviceRow {
  device_token: string
  bundle_id: string
  environment: string
  activity_token: string | null
  registered_at: string
  last_seen_at: string
  last_push_at: string | null
  last_push_kind: string | null
  last_push_error: string | null
}

/** Das Gerät samt Activity-Token — bleibt im Main-Prozess. */
export interface PushDeviceRecord extends PushDevice {
  activityToken: string | null
}

function toEnvironment(raw: string): PushEnvironment {
  return raw === 'production' ? 'production' : 'sandbox'
}

function toRecord(row: PushDeviceRow): PushDeviceRecord {
  return {
    deviceToken: row.device_token,
    bundleId: row.bundle_id,
    environment: toEnvironment(row.environment),
    hasActivityToken: row.activity_token !== null && row.activity_token !== '',
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
    lastPushAt: row.last_push_at,
    lastPushKind: row.last_push_kind,
    lastPushError: row.last_push_error,
    activityToken: row.activity_token,
  }
}

/** Was über IPC gehen darf: ohne das Activity-Token. */
export function toPublicDevice(record: PushDeviceRecord): PushDevice {
  const { activityToken: _activityToken, ...device } = record
  return device
}

export interface RegisterPushDeviceInput {
  deviceToken: string
  bundleId: string
  environment: PushEnvironment
  activityToken?: string | null
}

export function listPushDevices(): PushDeviceRecord[] {
  return getDb()
    .prepare<[], PushDeviceRow>('SELECT * FROM push_devices ORDER BY last_seen_at DESC')
    .all()
    .map(toRecord)
}

export function getPushDevice(deviceToken: string): PushDeviceRecord | null {
  const row = getDb()
    .prepare<[string], PushDeviceRow>('SELECT * FROM push_devices WHERE device_token = ?')
    .get(deviceToken)
  return row ? toRecord(row) : null
}

export function countPushDevices(): number {
  return (
    getDb().prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM push_devices').get()
      ?.count ?? 0
  )
}

/**
 * Anmeldung eines Geräts. Dasselbe Token zweimal ist der Normalfall — iOS liefert es bei
 * jedem Start erneut —, deshalb wird dann nur nachgezogen statt ein zweiter Eintrag angelegt.
 *
 * Ein fehlendes `activityToken` löscht ein vorhandenes **nicht**: die App meldet sich auch
 * dann wieder an, wenn gerade keine Live Activity läuft, und das Token bleibt bis zum
 * nächsten Start gültig. `null` ausdrücklich zu schicken löscht es.
 */
export function registerPushDevice(input: RegisterPushDeviceInput): PushDeviceRecord {
  const now = nowIso()
  const existing = getPushDevice(input.deviceToken)

  if (!existing) {
    getDb()
      .prepare(
        `INSERT INTO push_devices
           (device_token, bundle_id, environment, activity_token, registered_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.deviceToken,
        input.bundleId,
        input.environment,
        input.activityToken ?? null,
        now,
        now,
      )
    return getPushDevice(input.deviceToken)!
  }

  const activityToken =
    input.activityToken === undefined ? existing.activityToken : input.activityToken

  getDb()
    .prepare(
      `UPDATE push_devices
          SET bundle_id = ?, environment = ?, activity_token = ?, last_seen_at = ?
        WHERE device_token = ?`,
    )
    .run(input.bundleId, input.environment, activityToken, now, input.deviceToken)

  return getPushDevice(input.deviceToken)!
}

export function removePushDevice(deviceToken: string): boolean {
  return getDb().prepare('DELETE FROM push_devices WHERE device_token = ?').run(deviceToken).changes > 0
}

/** Ergebnis der letzten Meldung. Nur zur Anzeige, deshalb ohne `last_seen_at`. */
export function recordPushResult(
  deviceToken: string,
  kind: string,
  error: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE push_devices
          SET last_push_at = ?, last_push_kind = ?, last_push_error = ?
        WHERE device_token = ?`,
    )
    .run(nowIso(), kind, error, deviceToken)
}

/** Ein Activity-Token, das APNs als ungültig gemeldet hat, ist nichts mehr wert. */
export function clearActivityToken(deviceToken: string): void {
  getDb()
    .prepare('UPDATE push_devices SET activity_token = NULL WHERE device_token = ?')
    .run(deviceToken)
}

// ---------------------------------------------------------------------------
// Der Schlüssel aus dem Developer-Konto — genau eine Zeile
// ---------------------------------------------------------------------------

interface PushCredentialsRow {
  key_p8: string | null
  key_id: string | null
  team_id: string | null
  key_file_name: string | null
  updated_at: string
}

/** Die drei Werte, wie sie in der Datenbank liegen: verschlüsselt, base64. */
export interface StoredPushCredentials {
  keyP8: string | null
  keyId: string | null
  teamId: string | null
  keyFileName: string | null
  updatedAt: string | null
}

const EMPTY_CREDENTIALS: StoredPushCredentials = {
  keyP8: null,
  keyId: null,
  teamId: null,
  keyFileName: null,
  updatedAt: null,
}

export function getStoredPushCredentials(): StoredPushCredentials {
  const row = getDb()
    .prepare<[], PushCredentialsRow>('SELECT * FROM push_credentials WHERE id = 1')
    .get()
  if (!row) return EMPTY_CREDENTIALS
  return {
    keyP8: row.key_p8,
    keyId: row.key_id,
    teamId: row.team_id,
    keyFileName: row.key_file_name,
    updatedAt: row.updated_at,
  }
}

/**
 * Der Schlüssel und die beiden Kennungen werden **getrennt** gespeichert: der `.p8` kommt aus
 * einem Dateidialog im Main-Prozess, Key-ID und Team-ID aus zwei Textfeldern. So muss der
 * Schlüsselinhalt nie durch den Renderer.
 */
export function savePushKey(input: { keyP8: string; keyFileName: string | null }): void {
  getDb()
    .prepare(
      `INSERT INTO push_credentials (id, key_p8, key_file_name, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         key_p8 = excluded.key_p8,
         key_file_name = excluded.key_file_name,
         updated_at = excluded.updated_at`,
    )
    .run(input.keyP8, input.keyFileName, nowIso())
}

export function savePushIds(input: { keyId: string; teamId: string }): void {
  getDb()
    .prepare(
      `INSERT INTO push_credentials (id, key_id, team_id, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         key_id = excluded.key_id,
         team_id = excluded.team_id,
         updated_at = excluded.updated_at`,
    )
    .run(input.keyId, input.teamId, nowIso())
}

export function clearPushCredentials(): void {
  getDb().prepare('DELETE FROM push_credentials WHERE id = 1').run()
}

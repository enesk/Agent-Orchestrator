import type { PushDevice, PushEnvironment, PushSnapshot, PushStatus } from '@shared/types'
import { getSettings, mainT } from '../app/settings'
import {
  clearActivityToken,
  countPushDevices,
  listPushDevices,
  recordPushResult,
  registerPushDevice,
  removePushDevice,
  toPublicDevice,
  type PushDeviceRecord,
  type RegisterPushDeviceInput,
} from '../db/repositories/pushDevices'
import { emitEvent } from '../ipc/events'
import { describeError, scopedLogger } from '../Logger'
import { DEAD_TOKEN_REASONS, Http2ApnsSender, type ApnsSender } from './ApnsSender'
import * as keys from './keyStore'
import {
  buildActivity,
  buildAlert,
  shortToken,
  type ActivityEvent,
  type ActivityState,
  type AlertInput,
  type PushKind,
} from './payload'

const log = scopedLogger('push')

/**
 * Der Versand selbst: Geräte verwalten, Nutzlast bauen, abschicken, Ergebnis festhalten.
 *
 * Zwei Dinge sind hier Absicht:
 *
 * 1. **Standardmäßig aus.** Ohne `pushEnabled` wird nicht einmal eine Nutzlast gebaut — der
 *    Versender existiert dann gar nicht.
 * 2. **Nichts wirft nach außen.** Diese Funktionen hängen am Ereignisstrom der App. Ein
 *    fehlender Schlüssel, ein stummes APNs, ein abgelaufenes Token: alles endet in einer
 *    Protokollzeile und einem `lastError`, nie in einer Ausnahme, die einen Agentenlauf
 *    anhält.
 */

let sender: ApnsSender | null = null
let lastError: string | null = null
let lastSentAt: string | null = null

/** Nur für den Sicherheitstest: eine Attrappe statt HTTP/2 nach Cupertino. */
let senderFactory: (() => ApnsSender) | null = null

export function setSenderFactory(factory: (() => ApnsSender) | null): void {
  senderFactory = factory
}

function createSender(): ApnsSender {
  return senderFactory ? senderFactory() : new Http2ApnsSender({ t: () => mainT() })
}

function activeSender(): ApnsSender | null {
  if (!getSettings().pushEnabled) return null
  if (!sender) {
    sender = createSender()
    sender.setCredentials(keys.credentials())
  }
  return sender
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

export function getStatus(): PushStatus {
  const settings = getSettings()
  const info = keys.info()
  return {
    enabled: settings.pushEnabled,
    configured: info.hasKey && info.hasKeyId && info.hasTeamId,
    hasKey: info.hasKey,
    hasKeyId: info.hasKeyId,
    hasTeamId: info.hasTeamId,
    keyFileName: info.keyFileName,
    deviceCount: countPushDevices(),
    lastSentAt,
    lastError,
    safeStorageAvailable: keys.isSecretStorageAvailable(),
  }
}

export function listDevices(): PushDevice[] {
  return listPushDevices().map(toPublicDevice)
}

export function snapshot(): PushSnapshot {
  return { status: getStatus(), devices: listDevices() }
}

export function announce(): void {
  emitEvent('push.changed', snapshot())
}

// ---------------------------------------------------------------------------
// Geräte
// ---------------------------------------------------------------------------

/**
 * Anmeldung vom iPhone. Das ist die eine Methode, die über die Brücke **kommen muss** — ohne
 * sie erfährt die App nie, wohin sie schicken soll.
 */
export function register(input: RegisterPushDeviceInput): PushDevice {
  const device = registerPushDevice(input)
  log.info('Gerät angemeldet', {
    device: shortToken(device.deviceToken),
    bundleId: device.bundleId,
    environment: device.environment,
    liveActivity: String(device.hasActivityToken),
  })
  announce()
  return toPublicDevice(device)
}

export function unregister(deviceToken: string): boolean {
  const removed = removePushDevice(deviceToken)
  if (removed) {
    log.info('Gerät abgemeldet', { device: shortToken(deviceToken) })
    announce()
  }
  return removed
}

// ---------------------------------------------------------------------------
// Schlüssel
// ---------------------------------------------------------------------------

/** Key-ID und Team-ID. */
export function setCredentials(keyId: string, teamId: string): PushStatus {
  keys.setIds(keyId, teamId)
  lastError = null
  // Der Versender hält ein Provider-Token im Zwischenspeicher; mit dem neuen Schlüssel wird
  // es sofort ungültig.
  sender?.setCredentials(keys.credentials())
  announce()
  return getStatus()
}

/** Der `.p8`-Schlüssel. Der Inhalt kommt aus dem Dateidialog, nicht aus dem Renderer. */
export function setKeyFile(p8: string, fileName: string | null): PushStatus {
  keys.setKey(p8, fileName)
  lastError = null
  sender?.setCredentials(keys.credentials())
  announce()
  return getStatus()
}

export function clearCredentials(): PushStatus {
  keys.clear()
  lastError = null
  sender?.setCredentials(null)
  announce()
  return getStatus()
}

// ---------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------

/** Welche Umgebung gilt: was das Gerät gesagt hat, oder der Zwang aus den Einstellungen. */
export function environmentFor(device: PushDeviceRecord): PushEnvironment {
  const choice = getSettings().pushEnvironment
  return choice === 'auto' ? device.environment : choice
}

export interface AlertRequest {
  kind: PushKind
  title: string
  body: string
  projectId?: string | null
  goalId?: number | null
  ticketNumber?: number | null
  collapseId?: string | null
}

/**
 * Eine Benachrichtigung an alle angemeldeten Geräte. Liefert, was zugestellt wurde — der
 * Aufrufer braucht das nicht, der Test schon.
 */
export async function sendAlert(request: AlertRequest): Promise<number> {
  const active = activeSender()
  if (!active) return 0

  const devices = listPushDevices()
  if (devices.length === 0) return 0

  let delivered = 0
  for (const device of devices) {
    const input: AlertInput = {
      kind: request.kind,
      bundleId: device.bundleId,
      title: request.title,
      body: request.body,
      projectId: request.projectId ?? null,
      goalId: request.goalId ?? null,
      ticketNumber: request.ticketNumber ?? null,
      collapseId: request.collapseId ?? null,
    }
    const message = buildAlert(input)
    if (await deliver(active, device, message, request.kind)) delivered += 1
  }
  return delivered
}

/**
 * Eine Zustandsaktualisierung der Live Activity. Geht nur an Geräte, die ein
 * Push-to-Update-Token geschickt haben — ohne Token gibt es keine Karte zu aktualisieren.
 */
export async function sendActivity(
  state: ActivityState,
  event: ActivityEvent,
  immediate = true,
): Promise<number> {
  const active = activeSender()
  if (!active) return 0

  const devices = listPushDevices().filter((device) => device.activityToken !== null)
  if (devices.length === 0) return 0

  let delivered = 0
  for (const device of devices) {
    const message = buildActivity({
      event,
      bundleId: device.bundleId,
      state,
      important: immediate,
      alert:
        event === 'end'
          ? { title: state.goalTitle, body: mainT()('main.push.activityEnded') }
          : undefined,
    })
    // Der Pfad richtet sich beim Live-Activity-Push an das **Activity**-Token, nicht an das
    // Gerätetoken — mit dem Gerätetoken antwortet APNs mit `BadDeviceToken`.
    if (await deliver(active, device, message, `activity.${event}`, device.activityToken!)) {
      delivered += 1
    }
  }
  return delivered
}

async function deliver(
  active: ApnsSender,
  device: PushDeviceRecord,
  message: { path: string; headers: Record<string, string>; body: Record<string, unknown> },
  kind: string,
  token = device.deviceToken,
): Promise<boolean> {
  const environment = environmentFor(device)

  // Belegbar im Protokoll, auch ohne Schlüssel: so lässt sich prüfen, dass die richtige
  // Nutzlast gebaut wurde. Das Provider-Token steht hier nicht — es entsteht erst im
  // Versender.
  log.debug('Nutzlast gebaut', {
    kind,
    device: shortToken(token),
    environment,
    pushType: message.headers['apns-push-type'] ?? '—',
    topic: message.headers['apns-topic'] ?? '—',
    priority: message.headers['apns-priority'] ?? '—',
    payload: JSON.stringify(message.body),
  })

  let delivery
  try {
    delivery = await active.send(environment, token, message)
  } catch (error) {
    // Der Versender verspricht, nicht zu werfen. Falls er es doch tut, endet es hier.
    const detail = describeError(error)
    lastError = String(detail.message)
    recordPushResult(device.deviceToken, kind, lastError)
    log.error('Versand fehlgeschlagen', { kind, ...detail })
    announce()
    return false
  }

  if (delivery.ok) {
    lastSentAt = new Date().toISOString()
    lastError = null
    recordPushResult(device.deviceToken, kind, null)
    log.info('Meldung zugestellt', { kind, device: shortToken(token), apnsId: delivery.apnsId ?? '—' })
    announce()
    return true
  }

  lastError = delivery.message ?? delivery.reason ?? 'unbekannt'
  recordPushResult(device.deviceToken, kind, lastError)
  log.warn('Meldung nicht zugestellt', {
    kind,
    device: shortToken(token),
    status: String(delivery.status ?? '—'),
    reason: delivery.reason ?? '—',
    message: lastError,
  })

  if (delivery.reason !== null && DEAD_TOKEN_REASONS.includes(delivery.reason)) {
    // Ein dauerhaft abgelehntes Token kommt nicht wieder. Beim Gerätetoken fällt das Gerät
    // ganz weg, beim Activity-Token nur die Karte.
    if (token === device.deviceToken) removePushDevice(device.deviceToken)
    else clearActivityToken(device.deviceToken)
    log.info('Token verworfen', { device: shortToken(token), reason: delivery.reason })
  }

  announce()
  return false
}

// ---------------------------------------------------------------------------
// An und aus
// ---------------------------------------------------------------------------

/** Bringt den Versender mit den Einstellungen in Übereinstimmung. */
export async function applySettings(): Promise<void> {
  if (!getSettings().pushEnabled) {
    await close()
    announce()
    return
  }

  if (!sender) sender = createSender()
  sender.setCredentials(keys.credentials())

  const status = getStatus()
  if (!status.configured) {
    log.warn('Push ist eingeschaltet, aber es ist kein APNs-Schlüssel hinterlegt', {
      hasKey: String(status.hasKey),
      hasKeyId: String(status.hasKeyId),
      hasTeamId: String(status.hasTeamId),
    })
  }
  announce()
}

export async function close(): Promise<void> {
  const current = sender
  sender = null
  lastError = null
  await current?.close()
}

/** Nur für den Test: den Tisch zwischen zwei Fällen leer machen. */
export function resetForTest(): void {
  sender = null
  lastError = null
  lastSentAt = null
}

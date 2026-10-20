import { randomUUID } from 'node:crypto'
import type { PushEnvironment } from '@shared/types'

/**
 * Nutzlasten und Kopfzeilen, wie Apple sie dokumentiert. Reine Funktionen ohne `electron`
 * und ohne Übersetzer: Titel und Text kommen fertig von außen, damit dieses Modul im
 * Sicherheitstest ohne App gefahren werden kann — und damit beim Bauen einer Nutzlast
 * garantiert nichts in die Datenbank oder in einen Agentenlauf greift.
 *
 * Die zweite Hälfte dieser Dateien liegt im Repository `orchestrator-ios`. Was hier gebaut
 * wird, muss dort als `Codable` ankommen — die Beispiele stehen in `REPORT-IOS-2.md`.
 */

/** Woraus eine Meldung entstanden ist. Geht als `kind` mit, damit die App sie zuordnen kann. */
export type PushKind =
  | 'goal.done'
  | 'goal.failed'
  | 'goal.cancelled'
  | 'goal.rateLimit'
  | 'ticket.stuck'
  | 'chat.done'

export type ActivityEvent = 'update' | 'end'

export const APNS_HOSTS: Record<PushEnvironment, string> = {
  sandbox: 'api.sandbox.push.apple.com',
  production: 'api.push.apple.com',
}

/**
 * Eine fertige Anfrage an APNs: Pfad, Kopfzeilen und Rumpf. Der Versender hängt nur noch
 * `authorization` an — das Token hat hier nichts verloren, sonst stünde es im Protokoll.
 */
export interface ApnsMessage {
  path: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function expiration(now: number, seconds: number): string {
  return String(Math.floor(now / 1000) + seconds)
}

// ---------------------------------------------------------------------------
// Benachrichtigungen
// ---------------------------------------------------------------------------

/**
 * Wie dringend eine Meldung ist. `time-sensitive` bräuchte eine eigene Berechtigung im
 * Developer-Konto, deshalb bleibt es bei `active` und `passive` — das kann jede App.
 */
const INTERRUPTION: Record<PushKind, 'active' | 'passive'> = {
  'goal.done': 'active',
  'goal.failed': 'active',
  'goal.cancelled': 'passive',
  'goal.rateLimit': 'passive',
  'ticket.stuck': 'active',
  'chat.done': 'passive',
}

export interface AlertInput {
  kind: PushKind
  bundleId: string
  title: string
  body: string
  projectId: string | null
  goalId: number | null
  ticketNumber: number | null
  /** Faltkennung: eine neue Meldung zum selben Anlass ersetzt die alte am Sperrbildschirm. */
  collapseId: string | null
}

/**
 * Eine gewöhnliche Benachrichtigung. `apns-push-type: alert`, Thema ist die Bundle-ID,
 * Priorität 10 (sofort zustellen). Eine Stunde Gültigkeit: ein schlafendes Telefon soll die
 * Meldung noch bekommen, eine zwei Stunden alte „Vorhaben fertig" braucht niemand mehr.
 */
export function buildAlert(input: AlertInput, now: number = Date.now()): ApnsMessage {
  const headers: Record<string, string> = {
    'apns-id': randomUUID(),
    'apns-push-type': 'alert',
    'apns-topic': input.bundleId,
    'apns-priority': '10',
    'apns-expiration': expiration(now, 60 * 60),
  }
  if (input.collapseId) headers['apns-collapse-id'] = input.collapseId

  const interruption = INTERRUPTION[input.kind]

  return {
    path: '',
    headers,
    body: {
      aps: {
        alert: { title: input.title, body: input.body },
        sound: interruption === 'active' ? 'default' : undefined,
        'interruption-level': interruption,
        'thread-id': input.goalId === null ? 'chat' : `goal-${input.goalId}`,
      },
      // Außerhalb von `aps`: alles, was die App zum Aufschlagen der richtigen Ansicht braucht.
      kind: input.kind,
      projectId: input.projectId,
      goalId: input.goalId,
      ticketNumber: input.ticketNumber,
    },
  }
}

// ---------------------------------------------------------------------------
// Live Activity
// ---------------------------------------------------------------------------

/**
 * Der Zustand, den die Karte am Sperrbildschirm zeigt. Muss Feld für Feld zur
 * `ContentState`-Struktur der iOS-App passen; die Reihenfolge ist für JSON belanglos, die
 * Namen sind es nicht.
 */
export interface ActivityState extends Record<string, unknown> {
  goalId: number
  goalTitle: string
  projectId: string
  /** `spec` | `tickets` | `work` | `review` | `done` — die Phase des Vorhabens. */
  phase: string
  status: string
  agentName: string | null
  ticketNumber: number | null
  ticketTitle: string | null
  /** Beschriftung des laufenden Werkzeugs; `null`, solange der Agent überlegt. */
  tool: string | null
  completed: number
  total: number
  updatedAt: string
}

export interface ActivityInput {
  event: ActivityEvent
  bundleId: string
  state: ActivityState
  /** Bei Phasenwechsel und am Ende: sofort zustellen, nicht sammeln. */
  important: boolean
  /** Beim Ende: Titel und Text, die statt der Karte stehen bleiben. */
  alert?: { title: string; body: string }
}

/**
 * Eine Zustandsaktualisierung per Push-to-Update. Das Thema ist **nicht** die Bundle-ID,
 * sondern `<bundleId>.push-type.liveactivity` — mit der Bundle-ID allein antwortet APNs mit
 * `400 TopicDisallowed`.
 *
 * `event: "start"` fehlt mit Absicht: eine Activity per Push zu starten braucht ein
 * Push-to-Start-Token, und das liefert `push.register` nicht. Die App startet sie selbst und
 * schickt ihr Update-Token mit.
 */
export function buildActivity(input: ActivityInput, now: number = Date.now()): ApnsMessage {
  const ending = input.event === 'end'
  const headers: Record<string, string> = {
    'apns-id': randomUUID(),
    'apns-push-type': 'liveactivity',
    'apns-topic': `${input.bundleId}.push-type.liveactivity`,
    // 5 heißt „darf gesammelt werden", 10 „jetzt". Gedrosselte Zwischenstände sind 5 wert,
    // ein Phasenwechsel und das Ende nicht.
    'apns-priority': input.important || ending ? '10' : '5',
    // Ein überholter Zwischenstand ist nichts mehr wert; das Ende soll ankommen.
    'apns-expiration': expiration(now, ending ? 60 * 60 : 120),
    // Alles zu einem Vorhaben fällt in einen Topf: eine wartende Aktualisierung wird von der
    // nächsten ersetzt, statt sich zu stapeln.
    'apns-collapse-id': `goal-${input.state.goalId}`,
  }

  const aps: Record<string, unknown> = {
    // Pflichtfeld, Sekunden. ActivityKit verwirft eine Nutzlast mit älterem Zeitstempel als
    // der schon angezeigte — damit kommt eine überholte Aktualisierung nie durch.
    timestamp: Math.floor(now / 1000),
    event: input.event,
    'content-state': input.state,
    // Ab wann der Zustand als veraltet gilt und die App ihn ausgraut.
    'stale-date': Math.floor(now / 1000) + 15 * 60,
    'relevance-score': ending ? 0 : 100,
  }

  if (ending) {
    // Die Karte bleibt kurz stehen, damit das Ergebnis lesbar ist, und verschwindet dann.
    aps['dismissal-date'] = Math.floor(now / 1000) + 5 * 60
    if (input.alert) aps.alert = { title: input.alert.title, body: input.alert.body }
  }

  return { path: '', headers, body: { aps } }
}

/** Der Pfad ist für beide Arten gleich. Getrennt, weil das Token nicht ins Protokoll gehört. */
export function devicePath(deviceToken: string): string {
  return `/3/device/${deviceToken}`
}

/**
 * Was vom Gerätetoken im Protokoll und in der Oberfläche stehen darf. Es ist kein Geheimnis
 * des Developer-Kontos, aber eine 64-stellige Hexzahle in jeder Protokollzeile hilft
 * niemandem.
 */
export function shortToken(deviceToken: string): string {
  return deviceToken.length <= 12 ? deviceToken : `${deviceToken.slice(0, 8)}…${deviceToken.slice(-4)}`
}

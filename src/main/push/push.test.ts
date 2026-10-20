import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { connect, createServer, type Http2Server, type IncomingHttpHeaders } from 'node:http2'
import test from 'node:test'
import { createTranslator } from '@shared/i18n'
import { ipcContract } from '@shared/ipc-contract'
import {
  clearContractHandlers,
  setContractHandler,
  setDispatchHooks,
} from '../ipc/dispatch'
import { buildContractDescription, isUnsupportedMethod, UNSUPPORTED_METHODS } from '../remote/contract'
import { handleClientMessage } from '../remote/protocol'
import { Http2ApnsSender } from './ApnsSender'
import { createProviderToken, decodeProviderToken, loadSigningKey, verifyProviderToken } from './jwt'
import { buildActivity, buildAlert, type ActivityState } from './payload'
import { ActivityThrottle, ACTIVITY_MIN_INTERVAL_MS, type ThrottleClock } from './throttle'

/**
 * Sicherheitstests des APNs-Versands. Drei Dinge dürfen nicht schiefgehen:
 *
 * 1. Der `.p8`-Schlüssel, die Key-ID und die Team-ID kommen über IPC **nie** zurück, und die
 *    Schlüsselverwaltung ist über die Brücke **nicht** erreichbar. Die Brücke hat keine
 *    Authentifizierung — ein Schlüssel, der dort herauskäme, könnte Benachrichtigungen an
 *    jede App des Teams schicken.
 * 2. `push.register` **ist** über die Brücke erreichbar. Ohne sie erfährt die App nie, wohin
 *    sie schicken soll.
 * 3. Ohne Schlüssel scheitert der Versand **sauber**. Diese Kette hängt am Ereignisstrom der
 *    App; eine Ausnahme hier würde einen Agentenlauf anhalten.
 *
 * Dazu wird der ganze Weg bis zur Zustellung nachgeprüft — Provider-Token, Kopfzeilen,
 * Nutzlast —, denn den echten Schlüssel des Nutzers gibt es noch nicht.
 *
 * Läuft ohne Electron: `jwt.ts`, `payload.ts`, `throttle.ts` und `ApnsSender.ts` holen sich
 * Übersetzer, Takt und Verbindungsaufbau von außen.
 */

const t = createTranslator('de')

// Ein echter P-256-Schlüssel im Format einer `.p8`-Datei aus dem Developer-Konto.
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const KEY_ID = 'ABCD1234EF'
const TEAM_ID = 'TEAM567890'
const BUNDLE_ID = 'com.eneskul.orchestrator'
const DEVICE_TOKEN = 'a'.repeat(64)
const ACTIVITY_TOKEN = 'b'.repeat(64)

// ---------------------------------------------------------------------------
// 1. Der Schlüssel kommt über IPC nicht zurück
// ---------------------------------------------------------------------------

/** Namen, die in keiner Antwort der Domäne `push` vorkommen dürfen. */
const FORBIDDEN_IN_RESPONSES = ['p8', 'keyP8', 'keyId', 'teamId', 'activityToken']

test('keine Antwort der Domäne push trägt Schlüssel, Key-ID oder Team-ID', () => {
  const description = buildContractDescription('2.0.0')
  const push = description.domains.push
  assert.ok(push, 'die Domäne push fehlt im Vertrag')

  for (const [method, shape] of Object.entries(push)) {
    const response = JSON.stringify(shape.response)
    for (const name of FORBIDDEN_IN_RESPONSES) {
      assert.ok(
        !new RegExp(`"${name}"`).test(response),
        `push.${method} liefert „${name}" zurück — der Schlüssel gehört nicht nach draußen`,
      )
    }
  }
})

test('push.setCredentials nimmt den .p8 nicht an — er kommt aus dem Dateidialog', () => {
  // Der Schlüsselinhalt soll nie durch den Renderer gehen; `push.pickKeyFile` liest die Datei
  // im Main-Prozess und legt sie gleich verschlüsselt ab.
  const request = ipcContract.push.setCredentials.request.safeParse({
    keyId: KEY_ID,
    teamId: TEAM_ID,
    p8: P8,
  })
  assert.equal(request.success, true)
  assert.deepEqual(Object.keys(request.data as object).sort(), ['keyId', 'teamId'])
})

// ---------------------------------------------------------------------------
// 2. Die Brücke: Verwaltung nein, Anmeldung ja
// ---------------------------------------------------------------------------

/** Die Liste aus dem Ticket — hier ausgeschrieben, nicht abgeleitet. */
const KEY_METHODS = ['push.setCredentials', 'push.clearCredentials', 'push.pickKeyFile'] as const

const DEVICE_METHODS = ['push.register', 'push.unregister'] as const

test('die Schlüsselverwaltung steht in der unsupported-Liste, die Anmeldung nicht', () => {
  for (const entry of KEY_METHODS) {
    assert.ok(UNSUPPORTED_METHODS.includes(entry), `${entry} fehlt in der unsupported-Liste`)
    assert.ok(buildContractDescription('2.0.0').unsupported.includes(entry))
  }
  for (const entry of DEVICE_METHODS) {
    assert.ok(
      !UNSUPPORTED_METHODS.includes(entry),
      `${entry} steht in der unsupported-Liste — die App könnte sich nicht anmelden`,
    )
  }
  assert.ok(isUnsupportedMethod('push', 'pickKeyFile'))
  assert.ok(!isUnsupportedMethod('push', 'register'))
})

test('die Schlüsselverwaltung wird abgewiesen, ohne den Handler zu rufen', async () => {
  clearContractHandlers()
  setDispatchHooks(null)

  const called: string[] = []
  for (const entry of KEY_METHODS) {
    const [domain, method] = entry.split('.') as [string, string]
    setContractHandler(domain, method, () => {
      called.push(entry)
      return { ok: true }
    })
  }

  // Auch mit erfundener Nutzlast: die Prüfung sitzt vor dem Vertragsweg.
  for (const entry of KEY_METHODS) {
    const [domain, method] = entry.split('.') as [string, string]
    for (const payload of [undefined, null, {}, { keyId: KEY_ID, teamId: TEAM_ID }]) {
      const answer = await handleClientMessage(
        JSON.stringify({ t: 'call', id: 'k1', domain, method, payload }),
        { t },
      )
      assert.ok(!('dropped' in answer), entry)
      assert.equal(answer.ok, false, entry)
      assert.equal(answer.error?.code, 'unsupported', entry)
    }
  }

  assert.deepEqual(called, [], 'kein Handler der Schlüsselverwaltung darf gelaufen sein')
  clearContractHandlers()
})

test('push.register ist über die Brücke erreichbar', async () => {
  clearContractHandlers()
  setDispatchHooks(null)

  const registered: unknown[] = []
  setContractHandler('push', 'register', (input) => {
    registered.push(input)
    return {
      deviceToken: DEVICE_TOKEN,
      bundleId: BUNDLE_ID,
      environment: 'sandbox',
      hasActivityToken: true,
      registeredAt: '2026-10-20T10:00:00.000Z',
      lastSeenAt: '2026-10-20T10:00:00.000Z',
      lastPushAt: null,
      lastPushKind: null,
      lastPushError: null,
    }
  })

  const answer = await handleClientMessage(
    JSON.stringify({
      t: 'call',
      id: 'r1',
      domain: 'push',
      method: 'register',
      payload: {
        deviceToken: DEVICE_TOKEN,
        bundleId: BUNDLE_ID,
        environment: 'sandbox',
        activityToken: ACTIVITY_TOKEN,
      },
    }),
    { t },
  )

  assert.ok(!('dropped' in answer))
  assert.equal(answer.ok, true, JSON.stringify(answer.error))
  assert.deepEqual(registered, [
    {
      deviceToken: DEVICE_TOKEN,
      bundleId: BUNDLE_ID,
      environment: 'sandbox',
      activityToken: ACTIVITY_TOKEN,
    },
  ])

  // Eine unbrauchbare Umgebung erreicht den Handler nicht.
  const bad = await handleClientMessage(
    JSON.stringify({
      t: 'call',
      id: 'r2',
      domain: 'push',
      method: 'register',
      payload: { deviceToken: DEVICE_TOKEN, bundleId: BUNDLE_ID, environment: 'irgendwas' },
    }),
    { t },
  )
  assert.ok(!('dropped' in bad))
  assert.equal(bad.ok, false)
  assert.equal(bad.error?.code, 'validation')
  assert.equal(registered.length, 1, 'die ungültige Anmeldung darf den Handler nicht erreichen')

  clearContractHandlers()
})

// ---------------------------------------------------------------------------
// 3. Das Provider-Token
// ---------------------------------------------------------------------------

test('der .p8 wird geprüft, bevor er gespeichert wird', () => {
  const messages = { notAKey: 'kein Schlüssel', wrongCurve: 'falsche Kurve' }

  const key = loadSigningKey(P8, messages)
  assert.equal(key.asymmetricKeyType, 'ec')

  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const wrongCurve = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })

  assert.throws(() => loadSigningKey('kein PEM', messages), /kein Schlüssel/)
  assert.throws(
    () => loadSigningKey(rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), messages),
    /kein Schlüssel/,
  )
  assert.throws(
    () =>
      loadSigningKey(
        wrongCurve.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        messages,
      ),
    /falsche Kurve/,
  )
})

test('das Provider-Token ist ein ES256-JWT und wirklich signiert', () => {
  const now = Date.UTC(2026, 9, 20, 10, 0, 0)
  const { token } = createProviderToken(
    loadSigningKey(P8, { notAKey: 'x', wrongCurve: 'y' }),
    KEY_ID,
    TEAM_ID,
    now,
  )

  const decoded = decodeProviderToken(token)
  assert.ok(decoded)
  assert.equal(decoded.header.alg, 'ES256')
  assert.equal(decoded.header.kid, KEY_ID)
  assert.equal(decoded.header.typ, 'JWT')
  assert.equal(decoded.claims.iss, TEAM_ID)
  assert.equal(decoded.claims.iat, Math.floor(now / 1000))
  // JWS verlangt die rohen 64 Byte R‖S, nicht die DER-Hülle, die `createSign` liefert.
  assert.equal(decoded.signatureBytes, 64)

  assert.ok(verifyProviderToken(token, privateKey), 'die Signatur stimmt nicht')

  // Ein verändertes Token fällt durch.
  const [header, , signature] = token.split('.')
  const forged = `${header}.${Buffer.from('{"iss":"FREMD","iat":0}').toString('base64url')}.${signature}`
  assert.equal(verifyProviderToken(forged, privateKey), false)
})

// ---------------------------------------------------------------------------
// 4. Die Nutzlasten
// ---------------------------------------------------------------------------

const STATE: ActivityState = {
  goalId: 12,
  goalTitle: 'Push-Versand bauen',
  projectId: 'p-1',
  phase: 'work',
  status: 'in_progress',
  agentName: 'Umsetzung',
  ticketNumber: 7,
  ticketTitle: 'APNs-Versender',
  tool: 'Edit',
  completed: 3,
  total: 9,
  updatedAt: '2026-10-20T10:00:00.000Z',
}

test('die Benachrichtigung trägt die richtigen Kopfzeilen', () => {
  const now = Date.UTC(2026, 9, 20, 10, 0, 0)
  const message = buildAlert(
    {
      kind: 'goal.done',
      bundleId: BUNDLE_ID,
      title: 'Vorhaben abgeschlossen',
      body: 'Push-Versand bauen — 9 Tickets erledigt',
      projectId: 'p-1',
      goalId: 12,
      ticketNumber: null,
      collapseId: 'goal-12-end',
    },
    now,
  )

  assert.equal(message.headers['apns-push-type'], 'alert')
  assert.equal(message.headers['apns-topic'], BUNDLE_ID)
  assert.equal(message.headers['apns-priority'], '10')
  assert.equal(message.headers['apns-collapse-id'], 'goal-12-end')
  assert.equal(message.headers['apns-expiration'], String(Math.floor(now / 1000) + 3600))
  assert.match(String(message.headers['apns-id']), /^[0-9a-f-]{36}$/)

  const aps = (message.body as { aps: Record<string, unknown> }).aps
  assert.deepEqual(aps.alert, {
    title: 'Vorhaben abgeschlossen',
    body: 'Push-Versand bauen — 9 Tickets erledigt',
  })
  assert.equal(aps['interruption-level'], 'active')
  assert.equal(aps['thread-id'], 'goal-12')
  assert.equal((message.body as { goalId: unknown }).goalId, 12)
})

test('die Live Activity benutzt das eigene Thema und die von Apple verlangten Felder', () => {
  const now = Date.UTC(2026, 9, 20, 10, 0, 0)
  const update = buildActivity(
    { event: 'update', bundleId: BUNDLE_ID, state: STATE, important: false },
    now,
  )

  // Mit der Bundle-ID allein antwortet APNs mit `400 TopicDisallowed`.
  assert.equal(update.headers['apns-topic'], `${BUNDLE_ID}.push-type.liveactivity`)
  assert.equal(update.headers['apns-push-type'], 'liveactivity')
  // Ein gesammelter Zwischenstand darf warten.
  assert.equal(update.headers['apns-priority'], '5')
  assert.equal(update.headers['apns-collapse-id'], 'goal-12')

  const aps = (update.body as { aps: Record<string, unknown> }).aps
  assert.equal(aps.timestamp, Math.floor(now / 1000))
  assert.equal(aps.event, 'update')
  assert.deepEqual(aps['content-state'], STATE)
  assert.equal(aps['dismissal-date'], undefined, 'nur das Ende setzt ein Verfallsdatum')

  const ending = buildActivity(
    {
      event: 'end',
      bundleId: BUNDLE_ID,
      state: { ...STATE, status: 'done', completed: 9 },
      important: true,
      alert: { title: 'Push-Versand bauen', body: 'Der Lauf ist beendet.' },
    },
    now,
  )
  const endAps = (ending.body as { aps: Record<string, unknown> }).aps
  assert.equal(ending.headers['apns-priority'], '10')
  assert.equal(endAps.event, 'end')
  assert.equal(endAps['dismissal-date'], Math.floor(now / 1000) + 300)
  assert.deepEqual(endAps.alert, { title: 'Push-Versand bauen', body: 'Der Lauf ist beendet.' })
})

// ---------------------------------------------------------------------------
// 5. Die Drosselung
// ---------------------------------------------------------------------------

/** Ein Takt, den der Test vorwärts dreht — zwei Sekunden dauern hier keine zwei Sekunden. */
function fakeClock(): ThrottleClock & { advance: (ms: number) => void } {
  let current = 0
  const timers: { at: number; fn: () => void; handle: number }[] = []
  let nextHandle = 1

  return {
    now: () => current,
    setTimer: (fn, ms) => {
      const handle = nextHandle
      nextHandle += 1
      timers.push({ at: current + ms, fn, handle })
      return handle
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((timer) => timer.handle === handle)
      if (index >= 0) timers.splice(index, 1)
    },
    advance: (ms) => {
      const target = current + ms
      for (;;) {
        const due = timers
          .filter((timer) => timer.at <= target)
          .sort((a, b) => a.at - b.at)[0]
        if (!due) break
        timers.splice(timers.indexOf(due), 1)
        current = due.at
        due.fn()
      }
      current = target
    },
  }
}

test('zehn Aktivitäten in zwei Sekunden ergeben höchstens eine Nutzlast', () => {
  const clock = fakeClock()
  const sent: { event: string; immediate: boolean; tool: unknown }[] = []
  const throttle = new ActivityThrottle(
    (_goalId, state, event, immediate) => sent.push({ event, immediate, tool: state.tool }),
    clock,
  )

  for (let index = 0; index < 10; index += 1) {
    throttle.update(12, { ...STATE, tool: `Werkzeug ${index}` })
    clock.advance(200)
  }

  // Die erste ging sofort raus — danach wird gesammelt, und innerhalb der zwei Sekunden
  // kommt nichts mehr nach.
  assert.equal(sent.length, 1, `es wurden ${sent.length} Nutzlasten gebaut`)
  assert.equal(sent[0]?.tool, 'Werkzeug 0')
  assert.equal(sent[0]?.immediate, true)

  // Nach dem Fenster geht der **letzte** Stand raus, nicht die acht übersprungenen.
  clock.advance(ACTIVITY_MIN_INTERVAL_MS)
  assert.equal(sent.length, 2)
  assert.equal(sent[1]?.tool, 'Werkzeug 9')
  assert.equal(sent[1]?.immediate, false, 'ein gesammelter Stand geht mit Priorität 5')

  throttle.dispose()
})

test('ein Phasenwechsel geht sofort raus, ungedrosselt', () => {
  const clock = fakeClock()
  const sent: { event: string; phase: unknown }[] = []
  const throttle = new ActivityThrottle(
    (_goalId, state, event) => sent.push({ event, phase: state.phase }),
    clock,
  )

  throttle.update(12, STATE)
  clock.advance(300)
  throttle.update(12, { ...STATE, tool: 'Read' })
  assert.equal(sent.length, 1, 'der Zwischenstand wartet')

  clock.advance(100)
  throttle.update(12, { ...STATE, phase: 'review' }, true)
  assert.equal(sent.length, 2, 'der Phasenwechsel wartet nicht')
  assert.equal(sent[1]?.phase, 'review')

  // Der gemerkte Zwischenstand ist mit dem Phasenwechsel erledigt und kommt nicht nach.
  clock.advance(ACTIVITY_MIN_INTERVAL_MS * 2)
  assert.equal(sent.length, 2)

  // Das Ende ebenfalls sofort, und danach ist Schluss.
  throttle.end(12, { ...STATE, status: 'done' })
  assert.equal(sent.length, 3)
  assert.equal(sent[2]?.event, 'end')

  clock.advance(ACTIVITY_MIN_INTERVAL_MS * 2)
  assert.equal(sent.length, 3)

  throttle.dispose()
})

// ---------------------------------------------------------------------------
// 6. Der Weg bis zur Zustellung — und der Fall ohne Schlüssel
// ---------------------------------------------------------------------------

interface Received {
  headers: IncomingHttpHeaders
  body: string
}

let server: Http2Server
let origin: string
const received: Received[] = []
/** Was der Server antwortet; der Test stellt es je Fall ein. */
let answer: { status: number; body: string } = { status: 200, body: '' }

test.before(async () => {
  // Klartext-HTTP/2 auf dem Loopback: dieselbe Rahmenkodierung wie bei APNs, nur ohne
  // Zertifikat. Der Versender bekommt den Verbindungsaufbau von außen.
  server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      received.push({ headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })
      response.writeHead(answer.status, { 'apns-id': 'test-apns-id' })
      response.end(answer.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('kein Port')
  origin = `http://127.0.0.1:${address.port}`
})

test.after(() => {
  server.close()
})

function sender(): Http2ApnsSender {
  return new Http2ApnsSender({ t: () => t, connect: () => connect(origin) })
}

test('ohne Schlüssel scheitert der Versand sauber und wirft nicht', async () => {
  received.length = 0
  const apns = sender()

  const delivery = await apns.send('sandbox', DEVICE_TOKEN, buildActivity({
    event: 'update',
    bundleId: BUNDLE_ID,
    state: STATE,
    important: false,
  }))

  assert.equal(delivery.ok, false)
  assert.equal(delivery.status, null)
  assert.match(String(delivery.message), /kein APNs-Schlüssel/)
  assert.deepEqual(received, [], 'ohne Schlüssel darf nichts hinausgehen')

  // Auch ein kaputter Schlüssel endet in einem Ergebnis, nicht in einer Ausnahme.
  apns.setCredentials({ p8: 'kein PEM', keyId: KEY_ID, teamId: TEAM_ID })
  const broken = await apns.send('sandbox', DEVICE_TOKEN, buildAlert({
    kind: 'goal.done',
    bundleId: BUNDLE_ID,
    title: 'Titel',
    body: 'Text',
    projectId: null,
    goalId: 1,
    ticketNumber: null,
    collapseId: null,
  }))
  assert.equal(broken.ok, false)
  assert.equal(broken.reason, 'InvalidProviderToken')
  assert.deepEqual(received, [])

  await apns.close()
})

test('mit Schlüssel kommt die Meldung mit Token, Pfad und Kopfzeilen an', async () => {
  received.length = 0
  answer = { status: 200, body: '' }

  const apns = sender()
  apns.setCredentials({ p8: P8, keyId: KEY_ID, teamId: TEAM_ID })

  const message = buildAlert({
    kind: 'ticket.stuck',
    bundleId: BUNDLE_ID,
    title: 'Ticket #7 steckt fest',
    body: 'APNs-Versender — dreimal versucht',
    projectId: 'p-1',
    goalId: 12,
    ticketNumber: 7,
    collapseId: 'ticket-7-stuck',
  })

  const delivery = await apns.send('production', DEVICE_TOKEN, message)

  assert.equal(delivery.ok, true, String(delivery.message))
  assert.equal(delivery.status, 200)
  assert.equal(delivery.apnsId, 'test-apns-id')
  assert.equal(received.length, 1)

  const sent = received[0]!
  assert.equal(sent.headers[':method'], 'POST')
  assert.equal(sent.headers[':path'], `/3/device/${DEVICE_TOKEN}`)
  assert.equal(sent.headers['content-type'], 'application/json')
  assert.equal(sent.headers['apns-push-type'], 'alert')
  assert.equal(sent.headers['apns-topic'], BUNDLE_ID)
  assert.equal(sent.headers['apns-priority'], '10')
  assert.equal(sent.headers['apns-collapse-id'], 'ticket-7-stuck')

  // Das Provider-Token ist unterwegs wirklich dabei und hält der Prüfung stand.
  const authorization = String(sent.headers.authorization)
  assert.match(authorization, /^bearer /)
  const token = authorization.slice('bearer '.length)
  assert.ok(verifyProviderToken(token, privateKey))
  assert.equal(decodeProviderToken(token)?.claims.iss, TEAM_ID)

  assert.deepEqual(JSON.parse(sent.body), message.body)

  // Dieselbe Sitzung wird wiederbenutzt, und das Token auch — Apple mag kein neues je Meldung.
  const second = await apns.send('production', DEVICE_TOKEN, message)
  assert.equal(second.ok, true)
  assert.equal(received.length, 2)
  assert.equal(received[1]!.headers.authorization, sent.headers.authorization)

  await apns.close()
})

test('eine Ablehnung von APNs wird zum Ergebnis, nicht zur Ausnahme', async () => {
  received.length = 0
  answer = { status: 400, body: JSON.stringify({ reason: 'BadDeviceToken' }) }

  const apns = sender()
  apns.setCredentials({ p8: P8, keyId: KEY_ID, teamId: TEAM_ID })

  const delivery = await apns.send(
    'sandbox',
    DEVICE_TOKEN,
    buildActivity({ event: 'end', bundleId: BUNDLE_ID, state: STATE, important: true }),
  )

  assert.equal(delivery.ok, false)
  assert.equal(delivery.status, 400)
  assert.equal(delivery.reason, 'BadDeviceToken')
  assert.match(String(delivery.message), /abgelehnt \(400\)/)
  assert.equal(received.length, 1)
  assert.equal(
    received[0]!.headers['apns-topic'],
    `${BUNDLE_ID}.push-type.liveactivity`,
    'die Live Activity muss ihr eigenes Thema benutzen',
  )

  // Nach dem Wegnehmen des Schlüssels geht wieder nichts hinaus.
  apns.setCredentials(null)
  const after = await apns.send(
    'sandbox',
    DEVICE_TOKEN,
    buildActivity({ event: 'update', bundleId: BUNDLE_ID, state: STATE, important: false }),
  )
  assert.equal(after.ok, false)
  assert.equal(received.length, 1)

  await apns.close()
  answer = { status: 200, body: '' }
})

test('ein geschlossener Versender schickt nichts mehr', async () => {
  received.length = 0
  const apns = sender()
  apns.setCredentials({ p8: P8, keyId: KEY_ID, teamId: TEAM_ID })
  await apns.close()

  const delivery = await apns.send(
    'sandbox',
    DEVICE_TOKEN,
    buildAlert({
      kind: 'goal.cancelled',
      bundleId: BUNDLE_ID,
      title: 'Vorhaben abgebrochen',
      body: 'Push-Versand bauen',
      projectId: 'p-1',
      goalId: 12,
      ticketNumber: null,
      collapseId: 'goal-12-end',
    }),
  )

  assert.equal(delivery.ok, false)
  assert.deepEqual(received, [])
})

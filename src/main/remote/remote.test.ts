import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { z } from 'zod'
import { createTranslator } from '@shared/i18n'
import {
  callContractMethod,
  clearContractHandlers,
  setContractHandler,
  setDispatchHooks,
} from '../ipc/dispatch'
import { buildContractDescription, isUnsupportedMethod, stableHash, UNSUPPORTED_METHODS } from './contract'
import { createRequestHandler, attachmentIdFromPath, type AttachmentRecord } from './http'
import { handleClientMessage, readClientMessage } from './protocol'
import { acceptKey, decodeFrame, encodeFrame } from './websocket'

/**
 * Sicherheitstests der Fernzugriff-Brücke. Die Brücke hat **keine Authentifizierung** — jeder,
 * der die Adresse erreicht, darf alles. Umso wichtiger ist, dass sie nicht mehr hergibt als
 * den Vertrag: keine Datei außerhalb ihrer Verzeichnisse, kein nativer Dialog auf dem Mac und
 * kein Handler ohne gültige Nutzlast.
 *
 * Läuft ohne Electron: `dispatch.ts`, `http.ts`, `protocol.ts` und `websocket.ts` bekommen
 * ihre Abhängigkeiten von außen.
 */

const t = createTranslator('de')

// ---------------------------------------------------------------------------
// Aufbau: ein echter HTTP-Server mit Attrappen statt Datenbank und Electron
// ---------------------------------------------------------------------------

const root = mkdtempSync(path.join(tmpdir(), 'w1-remote-'))
const userData = path.join(root, 'userData')
const attachmentsRoot = path.join(userData, 'attachments')
const webuiRoot = path.join(userData, 'webui')
const databaseFile = path.join(userData, 'orchestrator.db')

mkdirSync(path.join(attachmentsRoot, 'aaa'), { recursive: true })
mkdirSync(webuiRoot, { recursive: true })
mkdirSync(path.join(root, 'webui-evil'), { recursive: true })
writeFileSync(databaseFile, 'SQLite format 3\u0000GEHEIM')
writeFileSync(path.join(attachmentsRoot, 'aaa', 'bild.png'), 'PNG-BYTES')
writeFileSync(path.join(webuiRoot, 'index.html'), '<!doctype html><title>webui</title>')
writeFileSync(path.join(webuiRoot, 'app.js'), 'console.log(1)')
writeFileSync(path.join(root, 'webui-evil', 'secret.txt'), 'NEBENORDNER')

const attachments = new Map<string, AttachmentRecord>([
  ['aaa', { relativePath: 'aaa/bild.png', fileName: 'bild.png', mimeType: 'image/png' }],
  // Ein manipulierter Datenbankeintrag — die zweite Verteidigungslinie.
  ['boese', { relativePath: '../../orchestrator.db', fileName: 'db', mimeType: null }],
  ['boese2', { relativePath: '/etc/passwd', fileName: 'passwd', mimeType: null }],
  ['boese3', { relativePath: '..%2F..%2Forchestrator.db', fileName: 'db', mimeType: null }],
])

const rejected: string[] = []

const handler = createRequestHandler({
  appVersion: '2.0.0',
  contract: () => buildContractDescription('2.0.0'),
  lookupAttachment: (id) => attachments.get(id) ?? null,
  attachmentsRoot: () => attachmentsRoot,
  staticRoot: () => webuiRoot,
  onRejected: (reason) => rejected.push(reason),
})

let server: Server
let base: string

test.before(async () => {
  server = createServer((request, response) => {
    void handler(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('kein Port')
  base = `http://127.0.0.1:${address.port}`
})

test.after(() => {
  server.close()
})

async function get(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${base}${url}`)
  return { status: response.status, body: await response.text() }
}

// ---------------------------------------------------------------------------
// 1. Anhänge geben die Datenbank nicht her
// ---------------------------------------------------------------------------

test('GET /attachments/<traversal> liefert nicht die Datenbank', async () => {
  const attempts = [
    '/attachments/..%2F..%2Forchestrator.db',
    '/attachments/..%2f..%2forchestrator.db',
    '/attachments/..%252F..%252Forchestrator.db',
    '/attachments/%2e%2e%2f%2e%2e%2forchestrator.db',
    '/attachments/..\\..\\orchestrator.db',
    '/attachments/%2Fetc%2Fpasswd',
    '/attachments/aaa%2F..%2F..%2F..%2Forchestrator.db',
    '/attachments/..%00/orchestrator.db',
    '/attachments/../../orchestrator.db',
    '/attachments/',
    '/attachments',
  ]

  for (const attempt of attempts) {
    const { status, body } = await get(attempt)
    assert.ok(!body.includes('GEHEIM'), `${attempt} hat Datenbankinhalt geliefert`)
    assert.ok(!body.includes('SQLite'), `${attempt} hat Datenbankinhalt geliefert`)
    // Entweder abgewiesen oder — wenn der Browser den Pfad vorher normalisiert hat — auf die
    // Weboberfläche zurückgefallen. Die Datenbank kommt in keinem Fall heraus.
    assert.ok(
      status === 404 || body.includes('<title>webui</title>'),
      `${attempt} → ${status}: ${body.slice(0, 80)}`,
    )
  }
})

test('ein manipulierter Datenbankeintrag kommt nicht aus dem Anhangsverzeichnis heraus', async () => {
  for (const id of ['boese', 'boese2', 'boese3']) {
    const { status, body } = await get(`/attachments/${id}`)
    assert.equal(status, 404, `${id} sollte 404 sein`)
    assert.ok(!body.includes('GEHEIM'))
  }
})

test('ein echter Anhang wird mit Content-Type ausgeliefert', async () => {
  const response = await fetch(`${base}/attachments/aaa`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('content-security-policy'), 'sandbox')
  assert.equal(await response.text(), 'PNG-BYTES')
})

test('IDs, die nach einem Pfad aussehen, erreichen die Datenbank nie', () => {
  assert.equal(attachmentIdFromPath('/attachments/aaa'), 'aaa')
  assert.equal(attachmentIdFromPath('/attachments/..%2Fx'), null)
  assert.equal(attachmentIdFromPath('/attachments/a/b'), null)
  assert.equal(attachmentIdFromPath('/attachments/%2e%2e'), null)
  assert.equal(attachmentIdFromPath('/attachments/a%00b'), null)
  assert.equal(attachmentIdFromPath('/attachments/'), null)
  assert.equal(attachmentIdFromPath('/attachments/%ZZ'), null)
  assert.equal(attachmentIdFromPath('/health'), null)
})

// ---------------------------------------------------------------------------
// 2. Statische Dateien bleiben in ihrem Verzeichnis
// ---------------------------------------------------------------------------

test('statische Auslieferung bricht nicht aus ihrem Verzeichnis aus', async () => {
  const attempts = [
    '/..%2F..%2Forchestrator.db',
    '/..%2Forchestrator.db',
    '/%2e%2e%2forchestrator.db',
    '/../../userData/orchestrator.db',
    // Ein Geschwisterordner mit gleichem Präfix: hier reicht `startsWith` nicht.
    '/..%2Fwebui-evil%2Fsecret.txt',
  ]

  for (const attempt of attempts) {
    const { status, body } = await get(attempt)
    assert.ok(!body.includes('GEHEIM'), `${attempt} hat die Datenbank geliefert`)
    assert.ok(!body.includes('NEBENORDNER'), `${attempt} hat den Nachbarordner geliefert`)
    // Entweder abgewiesen oder auf die Weboberfläche zurückgefallen — niemals die Datei.
    assert.ok(status === 404 || body.includes('webui'), `${attempt} → ${status}`)
  }
})

test('vorhandene Dateien und der Rückfall auf index.html', async () => {
  const js = await fetch(`${base}/app.js`)
  assert.equal(js.status, 200)
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8')

  for (const url of ['/', '/index.html', '/chat/42']) {
    const { status, body } = await get(url)
    assert.equal(status, 200, url)
    assert.ok(body.includes('<title>webui</title>'), url)
  }
})

// ---------------------------------------------------------------------------
// 3. `/health` und `/contract` — Hash stabil
// ---------------------------------------------------------------------------

test('/health und /contract antworten, der Vertragshash ist über Aufrufe stabil', async () => {
  const health = JSON.parse((await get('/health')).body) as Record<string, unknown>
  assert.equal(health.ok, true)
  assert.equal(health.appVersion, '2.0.0')

  const first = JSON.parse((await get('/contract')).body) as Record<string, unknown>
  const second = JSON.parse((await get('/contract')).body) as Record<string, unknown>
  assert.equal(first.version, second.version)
  assert.equal(first.version, health.contractVersion)
  assert.match(String(first.version), /^sha256-[0-9a-f]{64}$/)
  assert.deepEqual(first.unsupported, [...UNSUPPORTED_METHODS])
  assert.ok(Object.keys(first.domains as object).length >= 13)
})

test('der Hash hängt nicht an der Reihenfolge der Schlüssel', () => {
  assert.equal(stableHash({ a: 1, b: [2, { c: 3, d: 4 }] }), stableHash({ b: [2, { d: 4, c: 3 }], a: 1 }))
  assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }))
})

test('eine Versionsänderung der App verschiebt den Vertragshash nicht', () => {
  const current = buildContractDescription('2.0.0').version
  const next = buildContractDescription('9.9.9')
  assert.equal(next.appVersion, '9.9.9')
  assert.equal(next.version, current)
})

test('HTTP nimmt keine schreibenden Methoden an', async () => {
  const response = await fetch(`${base}/contract`, { method: 'POST' })
  assert.equal(response.status, 405)
})

// ---------------------------------------------------------------------------
// 4. Die nativen Methoden: `unsupported`, kein Dialog auf dem Mac
// ---------------------------------------------------------------------------

/** Die Liste aus dem Drahtprotokoll, Stand 05.10.2026 — hier ausgeschrieben, nicht abgeleitet. */
const NATIVE_METHODS = [
  'projects.pickPath',
  'settings.pickClaudePath',
  'attachments.open',
  'app.openDatabaseFolder',
  'app.showDatabaseFile',
  'skills.export',
  // Keine nativen Dialoge, sondern die MCP-Verwaltung: dort liegen Zugangsdaten, und die
  // Brücke ist ohne Zugangsschutz erreichbar.
  'mcp.list',
  'mcp.listForProject',
  'mcp.create',
  'mcp.update',
  'mcp.remove',
  'mcp.assign',
  'mcp.unassign',
  'mcp.probe',
  // Nachgetragen am 20.10.2026 mit IOS-2: die Verwaltung des APNs-Schlüssels. Er könnte
  // Benachrichtigungen an jede App des Teams schicken und gehört an den Rechner.
  // `push.register` und `push.unregister` stehen hier **nicht** — sie müssen vom iPhone
  // kommen, siehe `src/main/push/push.test.ts`.
  'push.setCredentials',
  'push.clearCredentials',
  'push.pickKeyFile',
] as const

test('die Liste der nativen Methoden steht genau so im Drahtprotokoll', () => {
  // Beide Seiten der Brücke richten sich nach dieser Liste, und ihre Reihenfolge geht in den
  // Vertragshash ein. Ein stilles Kürzen oder Umsortieren fällt hier auf.
  assert.deepEqual([...UNSUPPORTED_METHODS], [...NATIVE_METHODS])
})

test('die nativen Methoden werden abgelehnt, ohne den Handler zu rufen', async () => {
  clearContractHandlers()
  setDispatchHooks(null)

  const called: string[] = []
  // Jede bekommt einen Handler, der sich meldet, wenn er doch dran kommt.
  for (const entry of NATIVE_METHODS) {
    const [domain, method] = entry.split('.') as [string, string]
    setContractHandler(domain, method, () => {
      called.push(entry)
      return { ok: true }
    })
  }

  for (const entry of NATIVE_METHODS) {
    const [domain, method] = entry.split('.') as [string, string]
    const answer = await handleClientMessage(
      JSON.stringify({ t: 'call', id: 'x1', domain, method, payload: undefined }),
      { t },
    )
    assert.ok(!('dropped' in answer), entry)
    assert.equal(answer.ok, false, entry)
    assert.equal(answer.error?.code, 'unsupported', entry)
    assert.match(String(answer.error?.message), /nicht möglich/, entry)
    assert.ok(String(answer.error?.message).includes(entry), entry)
  }

  assert.deepEqual(called, [], 'kein nativer Handler darf gelaufen sein')
  assert.ok(isUnsupportedMethod('attachments', 'open'))
  assert.ok(!isUnsupportedMethod('chat', 'send'))
  clearContractHandlers()
})

test('app.showDatabaseFile öffnet über die Brücke keinen Finder', async () => {
  clearContractHandlers()
  setDispatchHooks(null)

  // Nachgetragen am 02.10.2026: die Methode zeigt die Datenbankdatei im Finder, also dieselbe
  // Kategorie wie `app.openDatabaseFolder`. Der Handler hier steht für genau diesen Finder.
  let finderOpened = 0
  setContractHandler('app', 'showDatabaseFile', () => {
    finderOpened += 1
    return { ok: true }
  })

  // Auch mit erfundener Nutzlast, mit `null` und ohne Nutzlast: die Prüfung sitzt davor.
  for (const payload of [undefined, null, {}, { force: true }]) {
    const answer = await handleClientMessage(
      JSON.stringify({ t: 'call', id: 'finder', domain: 'app', method: 'showDatabaseFile', payload }),
      { t },
    )
    assert.ok(!('dropped' in answer))
    assert.equal(answer.ok, false)
    assert.equal(answer.error?.code, 'unsupported')
  }

  assert.equal(finderOpened, 0, 'der Finder darf über die Brücke nicht aufgehen')
  assert.ok(isUnsupportedMethod('app', 'showDatabaseFile'))
  assert.ok(buildContractDescription('2.0.0').unsupported.includes('app.showDatabaseFile'))

  // Gegenprobe: über den IPC-Weg bleibt sie erreichbar — die Desktop-App braucht sie.
  const direct = await callContractMethod('app', 'showDatabaseFile', undefined)
  assert.equal(direct.ok, true)
  assert.equal(finderOpened, 1)
  clearContractHandlers()
})

// ---------------------------------------------------------------------------
// 5. Ungültige Nutzlast: `validation`, und kein Handler läuft
// ---------------------------------------------------------------------------

test('eine Nutzlast gegen das Schema ergibt validation und ruft keinen Handler', async () => {
  clearContractHandlers()
  setDispatchHooks(null)

  let calls = 0
  setContractHandler('chat', 'send', () => {
    calls += 1
    return { ok: true }
  })
  setContractHandler('tickets', 'update', () => {
    calls += 1
    return { ok: true }
  })

  const bad: unknown[] = [
    { t: 'call', id: 'a', domain: 'chat', method: 'send', payload: {} },
    { t: 'call', id: 'b', domain: 'chat', method: 'send', payload: { projectId: 1, content: 'x' } },
    { t: 'call', id: 'c', domain: 'chat', method: 'send', payload: null },
    { t: 'call', id: 'd', domain: 'chat', method: 'send' },
    { t: 'call', id: 'e', domain: 'chat', method: 'send', payload: 'DROP TABLE' },
    {
      t: 'call',
      id: 'f',
      domain: 'tickets',
      method: 'update',
      payload: { id: 't1', patch: { status: 'geheim' } },
    },
  ]

  for (const message of bad) {
    const answer = await handleClientMessage(JSON.stringify(message), { t })
    assert.ok(!('dropped' in answer), JSON.stringify(message))
    assert.equal(answer.ok, false, JSON.stringify(message))
    assert.equal(answer.error?.code, 'validation', JSON.stringify(message))
  }

  assert.equal(calls, 0, 'kein Handler darf mit ungültiger Nutzlast gelaufen sein')

  // Gegenprobe: mit gültiger Nutzlast kommt derselbe Handler dran.
  const good = await handleClientMessage(
    JSON.stringify({
      t: 'call',
      id: 'g',
      domain: 'chat',
      method: 'send',
      payload: { projectId: 'p1', content: 'hallo' },
    }),
    { t },
  )
  assert.ok(!('dropped' in good))
  assert.equal(good.ok, true)
  assert.equal(calls, 1)
  clearContractHandlers()
})

test('eine unbekannte Methode erfindet keinen Handler', async () => {
  clearContractHandlers()
  setDispatchHooks(null)
  const answer = await handleClientMessage(
    JSON.stringify({ t: 'call', id: 'z', domain: 'kernel', method: 'exec', payload: { cmd: 'rm' } }),
    { t },
  )
  assert.ok(!('dropped' in answer))
  assert.equal(answer.ok, false)
  assert.equal(answer.error?.code, 'internal')
})

test('eine registrierte Methode ohne Handler-Registrierung läuft nicht', async () => {
  clearContractHandlers()
  setDispatchHooks(null)
  const outcome = await callContractMethod('chat', 'send', { projectId: 'p1', content: 'x' })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.ok === false && outcome.code, 'internal')
})

test('der Vertragsweg prüft mit demselben Schema wie der Renderer', async () => {
  clearContractHandlers()
  setDispatchHooks(null)
  let seen: unknown = null
  setContractHandler('logs', 'recent', (input) => {
    seen = input
    return []
  })

  // `.optional()` bleibt optional, und der Handler bekommt den geparsten Wert.
  const outcome = await callContractMethod('logs', 'recent', { limit: 5 })
  assert.equal(outcome.ok, true)
  assert.deepEqual(seen, { limit: 5 })

  const rejectedOutcome = await callContractMethod('logs', 'recent', { limit: -1 })
  assert.equal(rejectedOutcome.ok, false)
  assert.equal(rejectedOutcome.ok === false && rejectedOutcome.code, 'validation')
  clearContractHandlers()
})

// ---------------------------------------------------------------------------
// 6. Nachrichten, die nicht ins Protokoll passen
// ---------------------------------------------------------------------------

test('unbrauchbare Nachrichten werden verworfen statt geraten', () => {
  assert.equal(readClientMessage('kein json', t).kind, 'drop')
  assert.equal(readClientMessage('[]', t).kind, 'drop')
  assert.equal(readClientMessage('"text"', t).kind, 'drop')
  assert.equal(readClientMessage('null', t).kind, 'drop')
  assert.equal(readClientMessage(JSON.stringify({ t: 'event', name: 'x' }), t).kind, 'drop')
  assert.equal(readClientMessage(JSON.stringify({ t: 'call' }), t).kind, 'drop')
  assert.equal(readClientMessage(JSON.stringify({ t: 'result', id: 'a' }), t).kind, 'reject')
  assert.equal(readClientMessage(JSON.stringify({ t: 'call', id: 'a' }), t).kind, 'reject')
  assert.equal(
    readClientMessage(JSON.stringify({ t: 'call', id: 'a', domain: 'chat', method: 7 }), t).kind,
    'reject',
  )
  assert.equal(
    readClientMessage(JSON.stringify({ t: 'call', id: 'a', domain: 'chat', method: 'history' }), t).kind,
    'call',
  )
})

// ---------------------------------------------------------------------------
// 7. WebSocket-Rahmen
// ---------------------------------------------------------------------------

test('der Begrüßungsschlüssel folgt RFC 6455', () => {
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
})

test('unmaskierte Rahmen werden abgewiesen', () => {
  // Der Server maskiert nicht — genau dieser Rahmen darf als Eingabe nicht durchgehen.
  const read = decodeFrame(encodeFrame(0x1, Buffer.from('hallo')))
  assert.ok(read !== null && !('frame' in read))
  assert.equal(read && 'code' in read ? read.code : 0, 1002)
})

test('maskierte Rahmen werden entschlüsselt, zu große abgewiesen', () => {
  const payload = Buffer.from('{"t":"call"}', 'utf8')
  const mask = Buffer.from([1, 2, 3, 4])
  const masked = Buffer.allocUnsafe(payload.length)
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index]! ^ mask[index % 4]!
  }
  const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked])

  const read = decodeFrame(frame)
  assert.ok(read !== null && 'frame' in read)
  if (read && 'frame' in read) {
    assert.equal(read.frame.payload.toString('utf8'), '{"t":"call"}')
    assert.equal(read.consumed, frame.length)
  }

  // Angekündigte 2^53 Bytes: abgewiesen, nicht alloziert.
  const huge = Buffer.concat([
    Buffer.from([0x81, 0xff]),
    Buffer.from([0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  ])
  const hugeRead = decodeFrame(huge)
  assert.ok(hugeRead !== null && !('frame' in hugeRead))
  assert.equal(hugeRead && 'code' in hugeRead ? hugeRead.code : 0, 1009)

  // Unvollständige Rahmen sind kein Fehler, nur „noch nicht fertig".
  assert.equal(decodeFrame(frame.subarray(0, 3)), null)
})

test('das Antwortschema des Vertrags bleibt beschreibbar', () => {
  // Scheitert die Umwandlung für eine Methode, liefert `/contract` sie nicht — und die
  // Weboberfläche könnte sie nicht typisieren.
  const description = buildContractDescription('2.0.0')
  for (const [domain, methods] of Object.entries(description.domains)) {
    for (const [method, shape] of Object.entries(methods)) {
      assert.ok(shape.request !== undefined, `${domain}.${method} ohne Request-Schema`)
      assert.ok(shape.response !== undefined, `${domain}.${method} ohne Response-Schema`)
    }
  }
  assert.ok(z.object({}) !== null)
  assert.ok(rejected.length > 0, 'abgewiesene Anfragen werden gemeldet')
})

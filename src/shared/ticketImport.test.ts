import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildWorkerPrompt, SPEC_EXCERPT_LIMIT } from '../main/goals/workerPrompt'
import {
  parseTicketImportFile,
  planTicketImport,
  type TicketImportFile,
} from './ticketImport'
import type { Ticket } from './types'

/**
 * Datenverlust ist dieselbe Sorte Fehler wie eine Sicherheitslücke: still, spät entdeckt und
 * ohne Spur. Diese Tests halten fest, dass nichts aus der Importdatei unterwegs verschwindet —
 * weder beim Parsen (Zod würde unbekannte Schlüssel entfernen) noch im Worker-Prompt (dort
 * wird das Pflichtenheft gekürzt, die Vorgaben dürfen es nicht sein).
 */

const REAL_FILE = path.join(__dirname, 'fixtures', 'ticketset-sun-ads-gold2-profil.json')

function plan(file: TicketImportFile) {
  return planTicketImport(file)
}

function parse(value: unknown) {
  return parseTicketImportFile(JSON.stringify(value))
}

function ticketOf(description: string | null): Ticket {
  return {
    id: 't1',
    projectId: 'p1',
    number: 7,
    title: 'Werbemittel anlegen',
    description,
    status: 'open',
    category: 'task',
    assignedAgentId: null,
    goalId: 1,
    externalId: 'SUN-1',
    epicId: null,
    guidelinesDocumentId: 'doc1',
    sortOrder: 0,
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
  }
}

// ---------------------------------------------------------------------------
// Erfundene Felder — der Fall „was der Nutzer morgen dazuschreibt"
// ---------------------------------------------------------------------------

test('Erfundene Ticketfelder landen wortgetreu unter „Weitere Angaben"', () => {
  const file = parse({
    meta: { schema_version: '1.0.0' },
    tickets: [
      {
        id: 'X-1',
        title: 'Irgendwas',
        description: 'Kurztext',
        wunschtermin: '2026-12-24',
        ampelfarbe: 'gelb',
        geheimzahl: 42,
        erledigt: false,
        beteiligte: ['Anna', 'Bert'],
        verschachtelt: { tief: { tiefer: 'ganz unten' } },
      },
    ],
  })

  const planned = plan(file).tickets[0]!
  const description = planned.description ?? ''

  assert.match(description, /## Weitere Angaben/)
  for (const needle of [
    'wunschtermin',
    '2026-12-24',
    'ampelfarbe',
    'gelb',
    '42',
    'false',
    'Anna',
    'Bert',
    'ganz unten',
  ]) {
    assert.ok(description.includes(needle), `"${needle}" fehlt in der Beschreibung`)
  }

  // Die Vorschau muss die Namen nennen können, nicht nur eine Zahl.
  assert.deepEqual(planned.extraFieldKeys, [
    'wunschtermin',
    'ampelfarbe',
    'geheimzahl',
    'erledigt',
    'beteiligte',
    'verschachtelt',
  ])
  assert.deepEqual(plan(file).carriedTicketFields, planned.extraFieldKeys)
})

test('Erfundene meta-Felder werden zu Abschnitten des Vorgaben-Dokuments', () => {
  const file = parse({
    meta: {
      project: 'SUN',
      feature_key: 'ERFUNDEN-1',
      schema_version: '1.0.0',
      hausregeln: ['Nichts löschen', 'Nichts messen'],
      kontaktperson: { name: 'Enes', telefon: '0151' },
      zeitfenster: '18.10. bis 20.10.',
    },
    tickets: [{ id: 'X-1', title: 'Irgendwas' }],
  })

  const guidelines = plan(file).guidelines
  assert.ok(guidelines, 'Vorgaben-Dokument erwartet')
  assert.equal(guidelines.title, 'Vorgaben — ERFUNDEN-1')
  assert.deepEqual(guidelines.sectionKeys, ['hausregeln', 'kontaktperson', 'zeitfenster'])

  for (const needle of ['## hausregeln', 'Nichts messen', 'Enes', '0151', '18.10. bis 20.10.']) {
    assert.ok(guidelines.content.includes(needle), `"${needle}" fehlt im Vorgaben-Dokument`)
  }

  // Die drei bekannten meta-Schlüssel bleiben Struktur und werden nicht zu Abschnitten.
  for (const known of ['## project', '## feature_key', '## schema_version']) {
    assert.ok(!guidelines.content.includes(known), `${known} gehört nicht ins Dokument`)
  }
})

test('Ohne meta-Extras entsteht kein Vorgaben-Dokument', () => {
  const file = parse({
    meta: { project: 'SUN', feature_key: 'LEER', schema_version: '1.0.0' },
    tickets: [{ id: 'X-1', title: 'Irgendwas', description: 'nur Text' }],
  })
  const result = plan(file)
  assert.equal(result.guidelines, null)
  assert.deepEqual(result.carriedTicketFields, [])
  assert.ok(!(result.tickets[0]!.description ?? '').includes('Weitere Angaben'))
})

test('Unbekannte Schlüssel der obersten Ebene werden ausdrücklich benannt', () => {
  const file = parse({
    meta: { schema_version: '1.0.0' },
    tickets: [{ id: 'X-1', title: 'Irgendwas' }],
    anhaenge: ['a.pdf'],
  })
  assert.deepEqual(plan(file).unrepresented, ['anhaenge (oberste Ebene)'])
})

// ---------------------------------------------------------------------------
// Die echte Datei des Nutzers
// ---------------------------------------------------------------------------

test('Echte Datei: Regeln, Werbemittel und ads.txt-Zeile sind im Vorgaben-Dokument', () => {
  const file = parseTicketImportFile(readFileSync(REAL_FILE, 'utf8'))
  const result = plan(file)
  const guidelines = result.guidelines
  assert.ok(guidelines, 'Vorgaben-Dokument erwartet')
  assert.equal(guidelines.title, 'Vorgaben — SUN-ADS-GOLD2-PROFIL')

  // Alle zehn Verbote, nicht nur das erste.
  const rules = (file.meta as { global_rules?: string[] }).global_rules ?? []
  assert.equal(rules.length, 10)
  for (const rule of rules) {
    assert.ok(guidelines.content.includes(rule), `Regel fehlt: ${rule.slice(0, 40)}…`)
  }

  // Die ad_slot-IDs stehen nur hier — ohne sie legt ein Agent das falsche Werbemittel an.
  for (const slot of [
    '7857921592',
    '7666349905',
    '5214526510',
    '5873002064',
    '8962199836',
    '2222451539',
    '3709873156',
  ]) {
    assert.ok(guidelines.content.includes(slot), `ad_slot ${slot} fehlt`)
  }

  assert.ok(
    guidelines.content.includes('google.com, pub-1901800422608466, DIRECT, f08c47fec0942fa0'),
    'ads_txt_line fehlt',
  )

  const domains = (file.meta as { tenants?: { domains?: string[] } }).tenants?.domains ?? []
  assert.equal(domains.length, 8)
  for (const domain of domains) {
    assert.ok(guidelines.content.includes(domain), `Domain ${domain} fehlt`)
  }

  assert.deepEqual(result.unrepresented, [])
})

test('Echte Datei: role, labels und estimate_hours stehen an jedem Ticket', () => {
  const file = parseTicketImportFile(readFileSync(REAL_FILE, 'utf8'))
  const result = plan(file)
  assert.deepEqual(result.carriedTicketFields, ['role', 'estimate_hours', 'labels'])

  for (const planned of result.tickets.filter((entry) => entry.category !== 'epic')) {
    const description = planned.description ?? ''
    assert.match(description, /## Weitere Angaben/)
    assert.match(description, /\*\*role:\*\*/)
    assert.match(description, /\*\*estimate_hours:\*\*/)
    assert.match(description, /\*\*labels:\*\*/)
    // priority behält seine bisherige Behandlung ganz oben in der Beschreibung.
    assert.match(description, /^\*\*Priorität:\*\*/)
  }
})

// ---------------------------------------------------------------------------
// Der Worker-Prompt kürzt die Vorgaben nicht
// ---------------------------------------------------------------------------

function promptWith(guidelines: string | null, spec: string | null): string {
  return buildWorkerPrompt({
    ticket: ticketOf('Beschreibung'),
    spec,
    guidelines,
    otherTickets: [],
    dependencies: [],
    attachments: [],
  })
}

test('Vorgaben stehen vollständig im Worker-Prompt, auch bei 10 KB', () => {
  const guidelines = `# Vorgaben\n${'Es gilt Regel 42. '.repeat(600)}\nENDE-DER-VORGABEN`
  assert.ok(guidelines.length > 10_000)

  const prompt = promptWith(guidelines, null)
  assert.ok(prompt.includes('## Vorgaben des Ticketsets'))
  assert.ok(prompt.includes(guidelines), 'Vorgaben wurden gekürzt oder verändert')
  assert.ok(prompt.includes('ENDE-DER-VORGABEN'), 'Das Ende der Vorgaben fehlt')
  assert.ok(!prompt.includes('…'), 'Im Prompt steht ein Auslassungszeichen')
})

test('Echte Vorgaben überleben den Worker-Prompt Zeichen für Zeichen', () => {
  const file = parseTicketImportFile(readFileSync(REAL_FILE, 'utf8'))
  const guidelines = plan(file).guidelines!
  assert.ok(guidelines.charCount > SPEC_EXCERPT_LIMIT, 'Testvorlage zu klein für die Falle')

  const prompt = promptWith(guidelines.content, null)
  assert.ok(prompt.includes(guidelines.content))
  for (const rule of (file.meta as { global_rules?: string[] }).global_rules ?? []) {
    assert.ok(prompt.includes(rule), `Regel fehlt im Prompt: ${rule.slice(0, 40)}…`)
  }
})

test('Die Vorgaben stehen vor den Regeln, nicht am Ende', () => {
  const prompt = promptWith('# Vorgaben\nKEINE Tests.', null)
  assert.ok(prompt.indexOf('## Vorgaben des Ticketsets') < prompt.indexOf('## Regeln'))
})

test('Das Pflichtenheft bleibt gekürzt — die Grenze gilt nur für den Auszug', () => {
  const spec = 'S'.repeat(SPEC_EXCERPT_LIMIT + 500)
  const prompt = promptWith('# Vorgaben\nKEINE Tests.', spec)
  assert.ok(!prompt.includes(spec), 'Das Pflichtenheft wird unerwartet vollständig übernommen')
  assert.ok(prompt.includes('## Pflichtenheft (Auszug)'))
  assert.ok(prompt.includes('KEINE Tests.'))
})

test('Ohne Vorgaben-Dokument entfällt der Abschnitt', () => {
  const prompt = promptWith(null, 'Pflichtenheft')
  assert.ok(!prompt.includes('Vorgaben des Ticketsets'))
})

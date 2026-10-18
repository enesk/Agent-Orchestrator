import { z } from 'zod'
import type { TicketCategory, TicketStatus } from './constants'

/**
 * Planung des Ticket-Imports als reine Funktion: Eingabe-JSON rein, geplante Inserts,
 * Updates und Abhängigkeiten raus. Kein Datenbankzugriff — dadurch bleibt nachvollziehbar,
 * was ein Import tun würde, bevor er etwas anfasst.
 *
 * Grundsatz: **nichts geht verloren.** Bekannte Felder behalten ihre Behandlung, alles Übrige
 * wird wortgetreu mitgeführt — pro Ticket als Abschnitt „Weitere Angaben", auf Set-Ebene als
 * Vorgaben-Dokument. Deshalb lassen alle drei Schemas unbekannte Schlüssel durch; mit dem
 * Zod-Standard (`strip`) wären sie beim Parsen still verschwunden.
 */

const textOrList = z.union([z.string(), z.array(z.string())])

const importTicketShape = {
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  assignee: z.string().nullable().optional(),
  epic: z.string().nullable().optional(),
  depends_on: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  acceptance_criteria: textOrList.optional(),
  technical_notes: textOrList.optional(),
  files: textOrList.optional(),
  definition_of_done: textOrList.optional(),
}

const importEpicShape = {
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
}

const importMetaShape = {
  project: z.string().nullable().optional(),
  feature_key: z.string().nullable().optional(),
  schema_version: z.string(),
}

const importTicketSchema = z.object(importTicketShape).passthrough()
const importEpicSchema = z.object(importEpicShape).passthrough()
const importMetaSchema = z.object(importMetaShape).passthrough()

export const ticketImportFileSchema = z
  .object({
    meta: importMetaSchema,
    epic: importEpicSchema.nullable().optional(),
    tickets: z.array(importTicketSchema),
  })
  .passthrough()

/** Die Schlüssel, die eine eigene Behandlung haben — alles andere wird mitgeführt. */
const KNOWN_TICKET_KEYS: ReadonlySet<string> = new Set(Object.keys(importTicketShape))
const KNOWN_EPIC_KEYS: ReadonlySet<string> = new Set(Object.keys(importEpicShape))
const KNOWN_META_KEYS: ReadonlySet<string> = new Set(Object.keys(importMetaShape))
const KNOWN_FILE_KEYS: ReadonlySet<string> = new Set(['meta', 'epic', 'tickets'])

export type TicketImportFile = z.output<typeof ticketImportFileSchema>
export type TicketImportEntry = z.output<typeof importTicketSchema>

/** Nur `1.x.x` wird unterstützt — spätere Hauptversionen dürfen anders aussehen. */
const SCHEMA_VERSION_PATTERN = /^1\.\d+(\.\d+)?$/

/** Damit die Vorschau im Renderer dieselbe Grenze zieht wie der Import selbst. */
export function isSupportedSchemaVersion(version: string): boolean {
  return SCHEMA_VERSION_PATTERN.test(version.trim())
}

const STATUS_ALIASES: Record<string, TicketStatus> = {
  open: 'open',
  offen: 'open',
  todo: 'open',
  'to-do': 'open',
  backlog: 'open',
  new: 'open',
  neu: 'open',
  in_progress: 'in_progress',
  'in-progress': 'in_progress',
  inprogress: 'in_progress',
  doing: 'in_progress',
  wip: 'in_progress',
  active: 'in_progress',
  'in arbeit': 'in_progress',
  done: 'done',
  closed: 'done',
  complete: 'done',
  completed: 'done',
  erledigt: 'done',
  fertig: 'done',
}

const CATEGORY_ALIASES: Record<string, TicketCategory> = {
  bug: 'bug',
  fehler: 'bug',
  defect: 'bug',
  fix: 'bug',
  feature: 'feature',
  funktion: 'feature',
  story: 'feature',
  task: 'task',
  aufgabe: 'task',
  chore: 'task',
  improvement: 'improvement',
  verbesserung: 'improvement',
  enhancement: 'improvement',
  refactor: 'improvement',
  refactoring: 'improvement',
  documentation: 'documentation',
  dokumentation: 'documentation',
  docs: 'documentation',
  question: 'question',
  frage: 'question',
  spike: 'question',
  research: 'question',
  epic: 'epic',
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'kritisch',
  blocker: 'kritisch',
  highest: 'sehr hoch',
  high: 'hoch',
  hoch: 'hoch',
  medium: 'mittel',
  normal: 'mittel',
  mittel: 'mittel',
  low: 'niedrig',
  niedrig: 'niedrig',
  lowest: 'sehr niedrig',
}

// --- Mitgeführte Felder -----------------------------------------------------

/**
 * Markdown aus beliebigem JSON — ohne Rateregeln nach Feldnamen. Listen werden zu einer
 * Aufzählung, Objekte eingerückt, Zahlen und Zeichenketten bleiben unverändert. Damit
 * überlebt auch ein Feld, das der Nutzer morgen erfindet.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scalarText(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? String(value)
}

/** Mehrzeilige Werte müssen eingerückt weitergehen, sonst bricht die Aufzählung. */
function continued(text: string, indent: string): string[] {
  const [first, ...rest] = text.split('\n')
  return [first ?? '', ...rest.map((line) => `${indent}${line}`)]
}

function entryLines(key: string, value: unknown, indent: string): string[] {
  if (isRecord(value)) {
    const inner = Object.entries(value).flatMap(([k, v]) => entryLines(k, v, `${indent}  `))
    return inner.length > 0 ? [`${indent}- **${key}:**`, ...inner] : [`${indent}- **${key}:** —`]
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}- **${key}:** —`]
    return [`${indent}- **${key}:**`, ...itemLines(value, `${indent}  `)]
  }
  const text = continued(scalarText(value), `${indent}  `).join('\n')
  return [`${indent}- **${key}:** ${text}`]
}

/** Nummeriert, damit die Grenzen zwischen den Einträgen auch bei Objekten eindeutig sind. */
function itemLines(items: readonly unknown[], indent: string): string[] {
  const lines: string[] = []
  items.forEach((item, index) => {
    const marker = `${indent}${index + 1}. `
    const pad = ' '.repeat(marker.length)
    if (isRecord(item)) {
      const fields = Object.entries(item).flatMap(([k, v]) =>
        isRecord(v) || Array.isArray(v)
          ? entryLines(k, v, pad)
          : [`${pad}**${k}:** ${continued(scalarText(v), `${pad}  `).join('\n')}`],
      )
      if (fields.length === 0) {
        lines.push(`${marker}—`)
      } else if (fields[0]!.startsWith(`${pad}**`)) {
        lines.push(`${marker}${fields[0]!.slice(pad.length)}`, ...fields.slice(1))
      } else {
        lines.push(marker.trimEnd(), ...fields)
      }
      return
    }
    if (Array.isArray(item)) {
      lines.push(marker.trimEnd(), ...itemLines(item, pad))
      return
    }
    lines.push(`${marker}${continued(scalarText(item), pad).join('\n')}`)
  })
  return lines
}

/** Ein Wert ohne vorangestellten Schlüssel — so sieht ein Abschnitt im Vorgaben-Dokument aus. */
function valueBlock(value: unknown): string {
  if (isRecord(value)) {
    const lines = Object.entries(value).flatMap(([k, v]) => entryLines(k, v, ''))
    return lines.length > 0 ? lines.join('\n') : '—'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? itemLines(value, '').join('\n') : '—'
  }
  return scalarText(value)
}

export interface ExtraField {
  key: string
  value: unknown
}

/** Reihenfolge wie im JSON — Zod reiht die unbekannten Schlüssel hinter die bekannten. */
function extrasOf(record: object, known: ReadonlySet<string>): ExtraField[] {
  return Object.entries(record)
    .filter(([key, value]) => !known.has(key) && value !== undefined)
    .map(([key, value]) => ({ key, value }))
}

/** Die zusätzlich mitgeführten Felder eines Tickets, in der Reihenfolge der Datei. */
export function ticketExtraFields(entry: TicketImportEntry): ExtraField[] {
  return extrasOf(entry, KNOWN_TICKET_KEYS)
}

/** Alles aus `meta` außer `project`, `feature_key` und `schema_version`. */
export function metaExtraFields(file: TicketImportFile): ExtraField[] {
  return extrasOf(file.meta, KNOWN_META_KEYS)
}

function extrasSection(extras: readonly ExtraField[]): string | null {
  if (extras.length === 0) return null
  const lines = extras.flatMap(({ key, value }) => entryLines(key, value, ''))
  return `## Weitere Angaben\n${lines.join('\n')}`
}

// --- Vorgaben-Dokument ------------------------------------------------------

export const GUIDELINES_TITLE_PREFIX = 'Vorgaben — '

/** Titel, unter dem ein Ticketset seine Vorgaben ablegt. Pro Projekt eindeutig. */
export function guidelinesDocumentTitle(file: TicketImportFile): string {
  const key =
    file.meta.feature_key?.trim() ||
    file.meta.project?.trim() ||
    file.epic?.id.trim() ||
    'Ticketset'
  return `${GUIDELINES_TITLE_PREFIX}${key}`
}

export interface GuidelinesDocument {
  title: string
  content: string
  /** Je `meta`-Schlüssel ein Abschnitt — die Zahl, die der Vorschau genügt. */
  sectionKeys: string[]
  charCount: number
}

/**
 * Baut aus den Zusatzangaben in `meta` ein Dokument. Ein Abschnitt je Schlüssel, Überschrift
 * ist der Schlüssel selbst — eine Übersetzung wäre geraten und würde Verbote verfälschen.
 */
export function buildGuidelinesDocument(file: TicketImportFile): GuidelinesDocument | null {
  const extras = metaExtraFields(file)
  if (extras.length === 0) return null

  const title = guidelinesDocumentTitle(file)
  const blocks = [
    `# ${title}`,
    'Wortgetreu aus dem `meta`-Block der Importdatei übernommen. Diese Vorgaben gelten für ' +
      'jedes Ticket dieses Sets — besonders dort, wo sie etwas verbieten.',
    ...extras.map(({ key, value }) => `## ${key}\n\n${valueBlock(value)}`),
  ]
  const content = blocks.join('\n\n')

  return {
    title,
    content,
    sectionKeys: extras.map((extra) => extra.key),
    charCount: content.length,
  }
}

export interface PlannedTicket {
  /** Kennung aus der Importdatei — landet als `externalId` am Ticket. */
  externalId: string
  title: string
  description: string | null
  /** Nur für neue Tickets relevant; bestehende behalten ihren Status. */
  status: TicketStatus
  category: TicketCategory
  /** `externalId` des Epics, zu dem dieses Ticket gehört. */
  epicExternalId: string | null
  /** Rohwert aus der Datei; die Auflösung auf einen Agenten passiert im Service. */
  assignee: string | null
  sortOrder: number
  isNew: boolean
  /** Namen der Felder, die zusätzlich unter „Weitere Angaben" in der Beschreibung stehen. */
  extraFieldKeys: string[]
}

export interface PlannedDependency {
  externalId: string
  dependsOn: string[]
}

export interface TicketImportPlan {
  meta: { project: string | null; featureKey: string | null; schemaVersion: string }
  /** Reihenfolge: Epic zuerst, damit `epicExternalId` beim Anlegen schon aufgelöst werden kann. */
  tickets: PlannedTicket[]
  dependencies: PlannedDependency[]
  /** `null`, wenn `meta` nichts außer den drei bekannten Schlüsseln enthält. */
  guidelines: GuidelinesDocument | null
  /** Alle zusätzlich mitgeführten Ticketfelder, in Reihenfolge ihres ersten Auftretens. */
  carriedTicketFields: string[]
  /** Was sich nicht abbilden ließ — ausdrücklich benannt, nicht verschwiegen. */
  unrepresented: string[]
  warnings: string[]
}

export interface PlanTicketImportOptions {
  /** `externalId`s, die im Projekt bereits existieren — daraus entsteht Insert vs. Update. */
  existingExternalIds?: readonly string[]
  /** Startwert für `sortOrder`, damit ein zweiter Import nicht vorne einsortiert. */
  sortOrderOffset?: number
}

export class TicketImportError extends Error {}

/** Parst rohes JSON und meldet Formatfehler mit deutscher Meldung. */
export function parseTicketImportFile(json: string): TicketImportFile {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return failParse('Die Datei enthält kein gültiges JSON.')
  }

  const parsed = ticketImportFileSchema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ')
    return failParse(`Das Importformat passt nicht: ${detail}`)
  }

  if (!isSupportedSchemaVersion(parsed.data.meta.schema_version)) {
    return failParse(
      `Nicht unterstützte schema_version "${parsed.data.meta.schema_version}" — erwartet wird 1.x.x.`,
    )
  }

  return parsed.data
}

function failParse(message: string): never {
  throw new TicketImportError(message)
}

export function planTicketImport(
  file: TicketImportFile,
  options: PlanTicketImportOptions = {},
): TicketImportPlan {
  const existing = new Set(options.existingExternalIds ?? [])
  const offset = options.sortOrderOffset ?? 0
  const warnings: string[] = []
  const tickets: PlannedTicket[] = []
  const seen = new Set<string>()

  const carried: string[] = []

  if (file.epic) {
    const extras = extrasOf(file.epic, KNOWN_EPIC_KEYS)
    seen.add(file.epic.id)
    tickets.push({
      externalId: file.epic.id,
      title: file.epic.title,
      description: buildEpicDescription(file.epic, extras),
      status: 'open',
      category: 'epic',
      epicExternalId: null,
      assignee: file.epic.owner ?? null,
      sortOrder: offset,
      isNew: !existing.has(file.epic.id),
      extraFieldKeys: extras.map((extra) => extra.key),
    })
  }

  for (const entry of file.tickets) {
    if (seen.has(entry.id)) {
      warnings.push(`Kennung "${entry.id}" kommt mehrfach vor — nur der erste Eintrag wird genutzt.`)
      continue
    }
    seen.add(entry.id)

    const extras = ticketExtraFields(entry)
    for (const extra of extras) {
      if (!carried.includes(extra.key)) carried.push(extra.key)
    }

    tickets.push({
      externalId: entry.id,
      title: entry.title,
      description: buildDescription(entry, extras),
      status: resolveStatus(entry, warnings),
      category: resolveCategory(entry.type),
      epicExternalId: entry.epic ?? file.epic?.id ?? null,
      assignee: entry.assignee ?? null,
      sortOrder: offset + tickets.length,
      isNew: !existing.has(entry.id),
      extraFieldKeys: extras.map((extra) => extra.key),
    })
  }

  // Epic-Referenzen erst prüfen, wenn alle Kennungen bekannt sind (Vorwärtsreferenzen).
  for (const ticket of tickets) {
    if (!ticket.epicExternalId) continue
    if (seen.has(ticket.epicExternalId) || existing.has(ticket.epicExternalId)) continue
    warnings.push(
      `Ticket "${ticket.externalId}" verweist auf das unbekannte Epic "${ticket.epicExternalId}".`,
    )
    ticket.epicExternalId = null
  }

  const dependencies: PlannedDependency[] = []
  const handled = new Set<string>()
  for (const entry of file.tickets) {
    // Verworfene Doppelgänger dürfen die Abhängigkeiten des Originals nicht überschreiben.
    if (handled.has(entry.id)) continue
    handled.add(entry.id)
    if (!entry.depends_on || entry.depends_on.length === 0) continue
    const dependsOn: string[] = []
    for (const reference of entry.depends_on) {
      if (reference === entry.id) {
        warnings.push(`Ticket "${entry.id}" hängt von sich selbst ab — Verweis verworfen.`)
        continue
      }
      if (!seen.has(reference) && !existing.has(reference)) {
        warnings.push(`Ticket "${entry.id}" hängt von unbekanntem Ticket "${reference}" ab.`)
        continue
      }
      if (!dependsOn.includes(reference)) dependsOn.push(reference)
    }
    dependencies.push({ externalId: entry.id, dependsOn })
  }

  return {
    meta: {
      project: file.meta.project ?? null,
      featureKey: file.meta.feature_key ?? null,
      schemaVersion: file.meta.schema_version,
    },
    tickets,
    dependencies,
    guidelines: buildGuidelinesDocument(file),
    carriedTicketFields: carried,
    unrepresented: extrasOf(file, KNOWN_FILE_KEYS).map((extra) => `${extra.key} (oberste Ebene)`),
    warnings,
  }
}

function resolveStatus(entry: TicketImportEntry, warnings: string[]): TicketStatus {
  if (!entry.status) return 'open'
  const mapped = STATUS_ALIASES[entry.status.trim().toLowerCase()]
  if (mapped) return mapped
  warnings.push(`Unbekannter Status "${entry.status}" bei "${entry.id}" — als "Offen" übernommen.`)
  return 'open'
}

function resolveCategory(type: string | undefined): TicketCategory {
  if (!type) return 'task'
  return CATEGORY_ALIASES[type.trim().toLowerCase()] ?? 'task'
}

function toLines(value: string | string[] | undefined): string[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list.map((line) => line.trim()).filter((line) => line.length > 0)
}

function section(title: string, lines: string[], bullets: boolean): string | null {
  if (lines.length === 0) return null
  const body = bullets ? lines.map((line) => `- ${line}`).join('\n') : lines.join('\n\n')
  return `## ${title}\n${body}`
}

/** Baut aus den Zusatzfeldern der Importdatei eine lesbare Markdown-Beschreibung. */
function buildDescription(entry: TicketImportEntry, extras: readonly ExtraField[]): string | null {
  const blocks: (string | null)[] = []

  if (entry.priority) {
    const label = PRIORITY_LABELS[entry.priority.trim().toLowerCase()] ?? entry.priority.trim()
    blocks.push(`**Priorität:** ${label}`)
  }
  if (entry.description?.trim()) blocks.push(entry.description.trim())

  blocks.push(section('Akzeptanzkriterien', toLines(entry.acceptance_criteria), true))
  blocks.push(section('Technische Hinweise', toLines(entry.technical_notes), false))
  blocks.push(section('Dateien', toLines(entry.files), true))
  blocks.push(section('Definition of Done', toLines(entry.definition_of_done), true))
  blocks.push(extrasSection(extras))

  const text = blocks.filter((block): block is string => Boolean(block)).join('\n\n')
  return text.length > 0 ? text : null
}

function buildEpicDescription(
  epic: z.output<typeof importEpicSchema>,
  extras: readonly ExtraField[],
): string | null {
  const blocks: (string | null)[] = []
  if (epic.goal?.trim()) blocks.push(epic.goal.trim())
  if (epic.owner?.trim()) blocks.push(`**Verantwortlich:** ${epic.owner.trim()}`)
  blocks.push(extrasSection(extras))
  const text = blocks.filter((block): block is string => Boolean(block)).join('\n\n')
  return text.length > 0 ? text : null
}

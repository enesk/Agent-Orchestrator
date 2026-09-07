import { z } from 'zod'
import type { TicketCategory, TicketStatus } from './constants'

/**
 * Planung des Ticket-Imports als reine Funktion: Eingabe-JSON rein, geplante Inserts,
 * Updates und Abhängigkeiten raus. Kein Datenbankzugriff — dadurch bleibt nachvollziehbar,
 * was ein Import tun würde, bevor er etwas anfasst.
 */

const textOrList = z.union([z.string(), z.array(z.string())])

const importTicketSchema = z.object({
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
})

const importEpicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
})

const importMetaSchema = z.object({
  project: z.string().nullable().optional(),
  feature_key: z.string().nullable().optional(),
  schema_version: z.string(),
})

export const ticketImportFileSchema = z.object({
  meta: importMetaSchema,
  epic: importEpicSchema.nullable().optional(),
  tickets: z.array(importTicketSchema),
})

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

  if (file.epic) {
    seen.add(file.epic.id)
    tickets.push({
      externalId: file.epic.id,
      title: file.epic.title,
      description: buildEpicDescription(file.epic),
      status: 'open',
      category: 'epic',
      epicExternalId: null,
      assignee: file.epic.owner ?? null,
      sortOrder: offset,
      isNew: !existing.has(file.epic.id),
    })
  }

  for (const entry of file.tickets) {
    if (seen.has(entry.id)) {
      warnings.push(`Kennung "${entry.id}" kommt mehrfach vor — nur der erste Eintrag wird genutzt.`)
      continue
    }
    seen.add(entry.id)

    tickets.push({
      externalId: entry.id,
      title: entry.title,
      description: buildDescription(entry),
      status: resolveStatus(entry, warnings),
      category: resolveCategory(entry.type),
      epicExternalId: entry.epic ?? file.epic?.id ?? null,
      assignee: entry.assignee ?? null,
      sortOrder: offset + tickets.length,
      isNew: !existing.has(entry.id),
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
function buildDescription(entry: TicketImportEntry): string | null {
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

  const text = blocks.filter((block): block is string => Boolean(block)).join('\n\n')
  return text.length > 0 ? text : null
}

function buildEpicDescription(epic: z.output<typeof importEpicSchema>): string | null {
  const blocks: string[] = []
  if (epic.goal?.trim()) blocks.push(epic.goal.trim())
  if (epic.owner?.trim()) blocks.push(`**Verantwortlich:** ${epic.owner.trim()}`)
  return blocks.length > 0 ? blocks.join('\n\n') : null
}

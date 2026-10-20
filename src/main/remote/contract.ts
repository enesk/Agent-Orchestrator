import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ipcContract, ipcEventNames, type IpcChannelDefinition } from '@shared/ipc-contract'

/**
 * `GET /contract` erzeugt seine Beschreibung aus dem Vertrag selbst — nichts hier ist
 * abgeschrieben. Die Weboberfläche liegt in einem anderen Repository und kann `src/shared/`
 * nicht mitbenutzen; diese Beschreibung samt Hash ist der einzige gemeinsame Bezugspunkt.
 *
 * Ohne `electron`, damit der Hash im Test ohne App nachgerechnet werden kann.
 */

/**
 * Was die Brücke nicht durchlässt. Zwei Gruppen:
 *
 * 1. Methoden, die einen nativen Dialog öffnen oder das Betriebssystem bemühen. Über die
 *    Brücke würden sie etwas auf dem Mac aufmachen, das am Telefon niemand sieht.
 * 2. Die Verwaltung der externen MCP-Server. Dort liegen Zugangsdaten für Header und
 *    Umgebung, und `ao.eneskul.com` ist ohne Zugangsschutz erreichbar. MCP-Verwaltung ist
 *    Einrichtung, keine Bedienung — sie gehört an den Rechner.
 *
 * Die Liste ist im Drahtprotokoll festgeschrieben, samt dieser Reihenfolge: sie geht in den
 * Vertragshash ein.
 */
export const UNSUPPORTED_METHODS: readonly string[] = [
  'projects.pickPath',
  'settings.pickClaudePath',
  'attachments.open',
  'app.openDatabaseFolder',
  // Nachgetragen am 02.10.2026: zeigt die Datenbankdatei im Finder, also dieselbe Kategorie
  // wie `app.openDatabaseFolder`.
  'app.showDatabaseFile',
  'skills.export',
  // Nachgetragen am 05.10.2026 mit FEAT-13: die gesamte MCP-Verwaltung, siehe oben.
  'mcp.list',
  'mcp.listForProject',
  'mcp.create',
  'mcp.update',
  'mcp.remove',
  'mcp.assign',
  'mcp.unassign',
  'mcp.probe',
  // Nachgetragen am 20.10.2026 mit IOS-2: die Verwaltung des APNs-Schlüssels. `push.register`
  // und `push.unregister` stehen **nicht** hier — sie müssen vom iPhone kommen.
  'push.setCredentials',
  'push.clearCredentials',
  'push.pickKeyFile',
]

const unsupportedLookup = new Set(UNSUPPORTED_METHODS)

export function isUnsupportedMethod(domain: string, method: string): boolean {
  return unsupportedLookup.has(`${domain}.${method}`)
}

export interface ContractMethodDescription {
  request: unknown
  response: unknown
}

export interface ContractDescription {
  version: string
  appVersion: string
  domains: Record<string, Record<string, ContractMethodDescription>>
  events: string[]
  unsupported: string[]
}

/**
 * JSON mit sortierten Schlüsseln. Nur so ergibt derselbe Vertrag denselben Hash, egal in
 * welcher Reihenfolge Zod seine Felder ausgibt.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
  return `{${entries.join(',')}}`
}

export function stableHash(value: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`
}

function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): unknown {
  // `unrepresentable: 'any'` ist nötig, weil `z.void()` (die Request-Schemas ohne Eingabe) in
  // JSON Schema keine Entsprechung hat.
  return z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'draft-2020-12' })
}

function describeDomains(): Record<string, Record<string, ContractMethodDescription>> {
  const domains: Record<string, Record<string, ContractMethodDescription>> = {}

  for (const [domain, methods] of Object.entries(
    ipcContract as unknown as Record<string, Record<string, IpcChannelDefinition>>,
  )) {
    const described: Record<string, ContractMethodDescription> = {}
    for (const [method, definition] of Object.entries(methods)) {
      described[method] = {
        // Der Request wird so beschrieben, wie der Aufrufer ihn schickt (`.default()`-Felder
        // optional), die Response so, wie sie ankommt.
        request: toJsonSchema(definition.request, 'input'),
        response: toJsonSchema(definition.response, 'output'),
      }
    }
    domains[domain] = described
  }

  return domains
}

let cached: ContractDescription | null = null

export function buildContractDescription(appVersion: string): ContractDescription {
  if (cached && cached.appVersion === appVersion) return cached

  // Die Version des Programms geht **nicht** in den Hash ein: ein Versionssprung ohne
  // Vertragsänderung soll die Weboberfläche nicht für veraltet erklären.
  const body = {
    domains: describeDomains(),
    events: [...ipcEventNames] as string[],
    unsupported: [...UNSUPPORTED_METHODS],
  }

  cached = { version: stableHash(body), appVersion, ...body }
  return cached
}

/** Nur der Hash, für `hello` und `/health`. */
export function contractVersion(appVersion: string): string {
  return buildContractDescription(appVersion).version
}

import {
  assignMcpServer,
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  getMcpServerByName,
  listMcpServers,
  listMcpServersForProject,
  listProjectIdsForMcpServer,
  recordMcpProbe,
  toPublicServer,
  unassignMcpServer,
  updateMcpServer,
} from '../db/repositories/mcpServers'
import { deleteSessionsForProject } from '../db/repositories/sessions'
import { getProject } from '../db/repositories/projects'
import { mainT } from '../app/settings'
import { emitEvent } from '../ipc/events'
import { describeError, scopedLogger } from '../Logger'
import { baseMcpServerName, RESERVED_MCP_SERVER_NAMES } from '@shared/mcpServerName'
import type { McpProbeResult, McpServer, McpTransport } from '@shared/types'
import { probeServer, type ProbeTarget } from './probeServer'
import { decryptSecrets, encryptSecrets, type SecretMap } from './secretStore'

const log = scopedLogger('mcp.servers')

/**
 * Ein Schlüssel-Wert-Paar, wie es aus der Oberfläche kommt. `value: null` heißt „unverändert" —
 * die Oberfläche bekommt gespeicherte Werte nie zu sehen und kann sie deshalb nicht
 * zurückschicken. Schlüssel, die nicht in der Liste stehen, werden gelöscht.
 */
export interface SecretPair {
  key: string
  value: string | null
}

export interface McpServerInput {
  name: string
  transport: McpTransport
  url?: string | null
  command?: string | null
  args?: readonly string[]
  headers?: readonly SecretPair[]
  env?: readonly SecretPair[]
  description?: string
}

export function list(): McpServer[] {
  return listMcpServers().map(toPublicServer)
}

export function listForProject(projectId: string): McpServer[] {
  return listMcpServersForProject(projectId).map(toPublicServer)
}

export function create(input: McpServerInput): McpServer {
  const transport = input.transport
  const server = createMcpServer({
    name: normalizeName(input.name),
    transport,
    url: transport === 'stdio' ? null : requireUrl(input.url),
    command: transport === 'stdio' ? requireCommand(input.command) : null,
    args: transport === 'stdio' ? cleanArgs(input.args) : [],
    headersEncrypted: encryptSecrets(mergeSecrets('{}', input.headers ?? [])),
    envEncrypted: encryptSecrets(mergeSecrets('{}', input.env ?? [])),
    description: input.description?.trim() ?? '',
  })
  emitEvent('mcpServer.changed', { serverId: server.id, projectId: null, action: 'created' })
  log.info('MCP-Server angelegt', { id: server.id, name: server.name, transport })
  return toPublicServer(server)
}

export function update(id: string, patch: Partial<McpServerInput>): McpServer {
  const existing = getMcpServer(id)
  if (!existing) throw new Error(mainT()('main.error.mcpServerGone'))

  const transport = patch.transport ?? existing.transport
  const url =
    transport === 'stdio'
      ? null
      : requireUrl(patch.url !== undefined ? patch.url : existing.url)
  const command =
    transport === 'stdio'
      ? requireCommand(patch.command !== undefined ? patch.command : existing.command)
      : null

  const server = updateMcpServer(id, {
    name: patch.name === undefined ? undefined : normalizeName(patch.name, id),
    transport,
    url,
    command,
    args: transport === 'stdio' ? cleanArgs(patch.args ?? existing.args) : [],
    headersEncrypted:
      patch.headers === undefined
        ? undefined
        : encryptSecrets(mergeSecrets(existing.headersEncrypted, patch.headers)),
    envEncrypted:
      patch.env === undefined
        ? undefined
        : encryptSecrets(mergeSecrets(existing.envEncrypted, patch.env)),
    description: patch.description?.trim(),
  })

  // Ein geänderter Server ändert die Werkzeugliste. Fortgesetzte Sessions kennen die alte.
  resetSessions(listProjectIdsForMcpServer(id))
  emitEvent('mcpServer.changed', { serverId: id, projectId: null, action: 'updated' })
  return toPublicServer(server)
}

export function remove(id: string): void {
  const projectIds = listProjectIdsForMcpServer(id)
  deleteMcpServer(id)
  resetSessions(projectIds)
  emitEvent('mcpServer.changed', { serverId: id, projectId: null, action: 'removed' })
  for (const projectId of projectIds) {
    emitEvent('mcpServer.changed', { serverId: id, projectId, action: 'removed' })
  }
  log.info('MCP-Server gelöscht', { id, projects: projectIds.length })
}

export function assign(projectId: string, serverId: string): McpServer[] {
  if (!getProject(projectId)) throw new Error(mainT()('main.error.projectGone'))
  if (!getMcpServer(serverId)) throw new Error(mainT()('main.error.mcpServerGone'))
  assignMcpServer(projectId, serverId)
  resetSessions([projectId])
  emitEvent('mcpServer.changed', { serverId, projectId, action: 'updated' })
  return listForProject(projectId)
}

export function unassign(projectId: string, serverId: string): McpServer[] {
  unassignMcpServer(projectId, serverId)
  resetSessions([projectId])
  emitEvent('mcpServer.changed', { serverId, projectId, action: 'updated' })
  return listForProject(projectId)
}

/**
 * Spricht den Server an. Mit `id` werden die gespeicherten Geheimnisse benutzt und das Ergebnis
 * am Server vermerkt; ohne `id` wird ein noch nicht gespeicherter Entwurf geprüft.
 */
export async function probe(
  input: { id?: string | null } & Partial<McpServerInput>,
): Promise<McpProbeResult> {
  const target = input.id ? storedTarget(input.id) : draftTarget(input)
  const result = await probeServer(target)
  if (input.id) {
    recordMcpProbe(input.id, result.toolNames.length)
    emitEvent('mcpServer.changed', { serverId: input.id, projectId: null, action: 'updated' })
  }
  log.info('MCP-Server geprüft', {
    id: input.id ?? null,
    server: result.serverName,
    tools: result.toolNames.length,
  })
  return result
}

/** Die entschlüsselten Geheimnisse eines Servers — nur für den Lauf, nie über IPC. */
export function serverSecrets(serverId: string): { headers: SecretMap; env: SecretMap } {
  const server = getMcpServer(serverId)
  if (!server) return { headers: {}, env: {} }
  return {
    headers: decryptSecrets(server.headersEncrypted),
    env: decryptSecrets(server.envEncrypted),
  }
}

// ---------------------------------------------------------------------------

function storedTarget(id: string): ProbeTarget {
  const server = getMcpServer(id)
  if (!server) throw new Error(mainT()('main.error.mcpServerGone'))
  return {
    transport: server.transport,
    url: server.url,
    command: server.command,
    args: server.args,
    headers: decryptSecrets(server.headersEncrypted),
    env: decryptSecrets(server.envEncrypted),
  }
}

function draftTarget(input: Partial<McpServerInput>): ProbeTarget {
  const transport = input.transport ?? 'http'
  return {
    transport,
    url: transport === 'stdio' ? null : requireUrl(input.url),
    command: transport === 'stdio' ? requireCommand(input.command) : null,
    args: cleanArgs(input.args),
    // Ein Entwurf hat noch keine gespeicherten Werte; `null` heißt hier „leer".
    headers: pairsToMap(input.headers ?? []),
    env: pairsToMap(input.env ?? []),
  }
}

function requireUrl(url: string | null | undefined): string {
  const trimmed = url?.trim()
  if (!trimmed) throw new Error(mainT()('main.error.mcpUrlMissing'))
  return trimmed
}

function requireCommand(command: string | null | undefined): string {
  const trimmed = command?.trim()
  if (!trimmed) throw new Error(mainT()('main.error.mcpCommandMissing'))
  return trimmed
}

function cleanArgs(args: readonly string[] | undefined): string[] {
  return [...(args ?? [])].map((arg) => arg.trim()).filter((arg) => arg.length > 0)
}

function pairsToMap(pairs: readonly SecretPair[]): SecretMap {
  const values: SecretMap = {}
  for (const pair of pairs) {
    const key = pair.key.trim()
    if (key) values[key] = pair.value ?? ''
  }
  return values
}

/**
 * Baut die neue Wertemenge: unveränderte Paare (`value: null`) übernehmen das gespeicherte
 * Chiffrat nicht — sie werden entschlüsselt und neu verschlüsselt, damit das Ergebnis ein
 * einheitliches Chiffrat ist. Fehlende Schlüssel fallen weg.
 */
function mergeSecrets(storedEncrypted: string, pairs: readonly SecretPair[]): SecretMap {
  const needsStored = pairs.some((pair) => pair.value === null)
  const stored = needsStored ? decryptSecrets(storedEncrypted) : {}
  const values: SecretMap = {}
  for (const pair of pairs) {
    const key = pair.key.trim()
    if (!key) continue
    values[key] = pair.value ?? stored[key] ?? ''
  }
  return values
}

/**
 * Normalisiert wie `normalizeSkillSlug`: klein, nur `[a-z0-9_-]`, global eindeutig, bei
 * Kollision mit Zähler. `orchestrator` gilt als belegt — ein Server mit diesem Namen würde den
 * eigenen MCP-Server in `--mcp-config` überschreiben und den Agenten seine Werkzeuge nehmen.
 */
export function normalizeMcpServerName(raw: string, excludeServerId?: string): string {
  const base = baseMcpServerName(raw)
  let candidate = base
  let counter = 2
  while (isTaken(candidate, excludeServerId)) {
    candidate = `${base}-${counter}`
    counter += 1
  }
  return candidate
}

function normalizeName(raw: string, excludeServerId?: string): string {
  return normalizeMcpServerName(raw, excludeServerId)
}

function isTaken(name: string, excludeServerId?: string): boolean {
  if (RESERVED_MCP_SERVER_NAMES.includes(name)) return true
  const owner = getMcpServerByName(name)
  return owner !== null && owner.id !== excludeServerId
}

function resetSessions(projectIds: readonly string[]): void {
  for (const projectId of projectIds) {
    try {
      deleteSessionsForProject(projectId)
    } catch (error) {
      log.warn('Sessions des Projekts konnten nicht verworfen werden', {
        projectId,
        ...describeError(error),
      })
    }
  }
}

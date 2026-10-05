import { getDb, nowIso } from '../connection'
import { buildUpdate, newId, parseStringArray } from '../utils'
import { secretKeys } from '../../mcp/secretEnvelope'
import type { McpServer, McpTransport } from '@shared/types'

interface McpServerRow {
  id: string
  name: string
  transport: string
  url: string | null
  command: string | null
  args: string
  headers: string
  env: string
  description: string
  tool_count: number | null
  checked_at: string | null
  created_at: string
  updated_at: string
}

/** Der Server samt verschlüsselter Geheimnisse — bleibt im Main-Prozess. */
export interface McpServerRecord extends McpServer {
  headersEncrypted: string
  envEncrypted: string
}

function toTransport(raw: string): McpTransport {
  return raw === 'sse' || raw === 'stdio' ? raw : 'http'
}

function toRecord(row: McpServerRow): McpServerRecord {
  return {
    id: row.id,
    name: row.name,
    transport: toTransport(row.transport),
    url: row.url,
    command: row.command,
    args: parseStringArray(row.args),
    headerKeys: secretKeys(row.headers),
    envKeys: secretKeys(row.env),
    description: row.description,
    toolCount: row.tool_count,
    checkedAt: row.checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    headersEncrypted: row.headers,
    envEncrypted: row.env,
  }
}

/** Was über IPC gehen darf: ohne die verschlüsselten Werte. */
export function toPublicServer(record: McpServerRecord): McpServer {
  const { headersEncrypted: _headers, envEncrypted: _env, ...server } = record
  return server
}

export interface CreateMcpServerInput {
  name: string
  transport: McpTransport
  url?: string | null
  command?: string | null
  args?: readonly string[]
  headersEncrypted?: string
  envEncrypted?: string
  description?: string
}

export interface UpdateMcpServerInput {
  name?: string
  transport?: McpTransport
  url?: string | null
  command?: string | null
  args?: readonly string[]
  headersEncrypted?: string
  envEncrypted?: string
  description?: string
}

export function listMcpServers(): McpServerRecord[] {
  return getDb()
    .prepare<[], McpServerRow>('SELECT * FROM mcp_servers ORDER BY name COLLATE NOCASE')
    .all()
    .map(toRecord)
}

export function getMcpServer(id: string): McpServerRecord | null {
  const row = getDb().prepare<[string], McpServerRow>('SELECT * FROM mcp_servers WHERE id = ?').get(id)
  return row ? toRecord(row) : null
}

export function getMcpServerByName(name: string): McpServerRecord | null {
  const row = getDb()
    .prepare<[string], McpServerRow>('SELECT * FROM mcp_servers WHERE name = ?')
    .get(name)
  return row ? toRecord(row) : null
}

/** Die einem Projekt zugewiesenen Server, in stabiler Reihenfolge — Grundlage jedes Laufs. */
export function listMcpServersForProject(projectId: string): McpServerRecord[] {
  return getDb()
    .prepare<[string], McpServerRow>(
      `SELECT s.* FROM project_mcp_servers pms
         JOIN mcp_servers s ON s.id = pms.server_id
        WHERE pms.project_id = ?
        ORDER BY s.name`,
    )
    .all(projectId)
    .map(toRecord)
}

/** Projekte, denen der Server zugewiesen ist — für Ereignisse und das Verwerfen von Sessions. */
export function listProjectIdsForMcpServer(serverId: string): string[] {
  return getDb()
    .prepare<[string], { project_id: string }>(
      'SELECT project_id FROM project_mcp_servers WHERE server_id = ?',
    )
    .all(serverId)
    .map((row) => row.project_id)
}

export function createMcpServer(input: CreateMcpServerInput): McpServerRecord {
  const id = newId()
  const now = nowIso()
  getDb()
    .prepare(
      `INSERT INTO mcp_servers
         (id, name, transport, url, command, args, headers, env, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.transport,
      input.url ?? null,
      input.command ?? null,
      JSON.stringify([...(input.args ?? [])]),
      input.headersEncrypted ?? '{}',
      input.envEncrypted ?? '{}',
      input.description ?? '',
      now,
      now,
    )
  return getMcpServer(id)!
}

export function updateMcpServer(id: string, patch: UpdateMcpServerInput): McpServerRecord {
  const { clause, values } = buildUpdate({
    name: patch.name,
    transport: patch.transport,
    url: patch.url,
    command: patch.command,
    args: patch.args === undefined ? undefined : JSON.stringify([...patch.args]),
    headers: patch.headersEncrypted,
    env: patch.envEncrypted,
    description: patch.description,
  })
  if (clause) {
    getDb()
      .prepare(`UPDATE mcp_servers SET ${clause}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id)
  }
  const server = getMcpServer(id)
  if (!server) throw new Error(`MCP-Server ${id} existiert nicht`)
  return server
}

/** Ergebnis des „Prüfen"-Knopfs. Nur zur Anzeige, deshalb ohne `updated_at`. */
export function recordMcpProbe(id: string, toolCount: number | null): void {
  getDb()
    .prepare('UPDATE mcp_servers SET tool_count = ?, checked_at = ? WHERE id = ?')
    .run(toolCount, nowIso(), id)
}

export function deleteMcpServer(id: string): void {
  getDb().prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
}

export function assignMcpServer(projectId: string, serverId: string): void {
  getDb()
    .prepare(
      `INSERT INTO project_mcp_servers (project_id, server_id) VALUES (?, ?)
         ON CONFLICT (project_id, server_id) DO NOTHING`,
    )
    .run(projectId, serverId)
}

export function unassignMcpServer(projectId: string, serverId: string): void {
  getDb()
    .prepare('DELETE FROM project_mcp_servers WHERE project_id = ? AND server_id = ?')
    .run(projectId, serverId)
}

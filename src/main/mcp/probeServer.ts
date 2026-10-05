import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { APP_NAME } from '@shared/constants'
import { claudeEnv } from '../claude/ClaudeCli'
import { describeError, scopedLogger } from '../Logger'
import type { McpProbeResult, McpTransport } from '@shared/types'
import type { SecretMap } from './secretEnvelope'

const log = scopedLogger('mcp.probe')

/** Lange genug für einen kalten stdio-Server, kurz genug, dass niemand vor der App wartet. */
const PROBE_TIMEOUT_MS = 20_000

export interface ProbeTarget {
  transport: McpTransport
  url?: string | null
  command?: string | null
  args?: readonly string[]
  headers?: SecretMap
  env?: SecretMap
}

/**
 * Spricht den Server mit demselben Handshake an, den die CLI fährt: `initialize`,
 * `notifications/initialized`, `tools/list`. Ohne das sucht man einen nicht antwortenden
 * Server im Prompt eines Agentenlaufs — dort fehlen seine Werkzeuge einfach lautlos.
 *
 * Fehler kommen im Klartext zurück, nicht als „fehlgeschlagen".
 */
export async function probeServer(target: ProbeTarget): Promise<McpProbeResult> {
  const startedAt = Date.now()
  const client = new Client({ name: APP_NAME, version: '1.0.0' })
  const transport = buildTransport(target)

  try {
    await withTimeout(client.connect(transport), 'Verbindungsaufbau').catch((error: unknown) => {
      throw explain(error)
    })
    const info = client.getServerVersion()
    const capabilities = client.getServerCapabilities()
    const instructions = client.getInstructions()

    // Ein Server ohne `tools`-Fähigkeit würde auf `tools/list` mit einem Fehler antworten.
    const toolNames = capabilities?.tools
      ? (await withTimeout(client.listTools(), 'tools/list')).tools.map((tool) => tool.name).sort()
      : []

    return {
      serverName: info?.name ?? null,
      serverVersion: info?.version ?? null,
      toolNames,
      instructionsLength: instructions ? instructions.length : null,
      durationMs: Date.now() - startedAt,
    }
  } finally {
    // Bei stdio bleibt sonst ein Kindprozess stehen.
    await client.close().catch((error: unknown) => {
      log.debug('Verbindung ließ sich nicht sauber schließen', describeError(error))
    })
  }
}

function buildTransport(target: ProbeTarget): Transport {
  if (target.transport === 'stdio') {
    const command = target.command?.trim()
    if (!command) throw new Error('Für einen stdio-Server fehlt der Befehl.')
    return new StdioClientTransport({
      command,
      args: [...(target.args ?? [])],
      // Ohne das erbt ein aus dem Dock gestarteter Mac-Prozess kaum einen PATH.
      env: { ...toStringEnv(claudeEnv()), ...(target.env ?? {}) },
      stderr: 'ignore',
    })
  }

  const url = parseUrl(target.url)
  const headers = target.headers ?? {}
  // Die Kopfzeilen über `fetch` statt über `requestInit`: nur so tragen sie auch den
  // SSE-Datenstrom, der nicht über `requestInit` läuft.
  const options = { requestInit: { headers }, fetch: withHeaders(headers) }
  return target.transport === 'sse'
    ? new SSEClientTransport(url, options)
    : new StreamableHTTPClientTransport(url, options)
}

/** Hängt die konfigurierten Kopfzeilen an jede Anfrage, ohne die der CLI zu überschreiben. */
function withHeaders(headers: SecretMap): FetchLike {
  return (input, init) => {
    const merged = new Headers(init?.headers)
    for (const [key, value] of Object.entries(headers)) merged.set(key, value)
    return fetch(input as string | URL, { ...init, headers: merged })
  }
}

function parseUrl(raw: string | null | undefined): URL {
  const trimmed = raw?.trim()
  if (!trimmed) throw new Error('Es fehlt die URL des Servers.')
  try {
    return new URL(trimmed)
  } catch {
    throw new Error(`„${trimmed}" ist keine gültige URL.`)
  }
}

function toStringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/**
 * `fetch` in Node verpackt den eigentlichen Grund in `cause` und meldet selbst nur
 * „fetch failed". Genau das wollte der „Prüfen"-Knopf nicht: der Nutzer soll lesen, dass die
 * Verbindung abgewiesen wurde, nicht dass irgendwas fehlgeschlagen ist.
 */
function explain(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error))
  const cause = (error as { cause?: unknown }).cause
  const detail = cause instanceof Error ? cause.message : null
  if (!detail || error.message.includes(detail)) return error
  return new Error(`${error.message}: ${detail}`)
}

async function withTimeout<T>(promise: Promise<T>, step: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${step} hat nach ${PROBE_TIMEOUT_MS / 1000} s nicht geantwortet.`)),
          PROBE_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

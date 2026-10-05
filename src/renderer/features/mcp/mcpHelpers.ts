import type { TranslationKey } from '@shared/i18n'
import type { McpServer, McpTransport } from '@shared/types'

export const MCP_TRANSPORTS: readonly McpTransport[] = ['http', 'sse', 'stdio']

export function transportLabelKey(transport: McpTransport): TranslationKey {
  return transport === 'sse'
    ? 'mcp.transport.sse'
    : transport === 'stdio'
      ? 'mcp.transport.stdio'
      : 'mcp.transport.http'
}

/** Was als Ziel in einer Zeile steht: URL oder Befehl samt Argumenten. */
export function describeTarget(server: McpServer): string {
  if (server.transport === 'stdio') {
    return [server.command ?? '', ...server.args].join(' ').trim()
  }
  return server.url ?? ''
}

/** Ein Paar, wie es im Editor steht. `value === null` heißt „gespeichert, unverändert". */
export interface PairDraft {
  key: string
  value: string | null
}

export function storedPairs(keys: readonly string[]): PairDraft[] {
  return keys.map((key) => ({ key, value: null }))
}

export function samePairs(a: readonly PairDraft[], b: readonly PairDraft[]): boolean {
  return (
    a.length === b.length &&
    a.every((pair, index) => pair.key === b[index]!.key && pair.value === b[index]!.value)
  )
}

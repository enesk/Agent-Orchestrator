import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export function ok(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

/**
 * Fehler werden als Ergebnis zurückgegeben, nicht geworfen: der Agent soll die Meldung lesen
 * und es anders versuchen, statt dass der ganze Lauf abbricht.
 */
export function fail(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

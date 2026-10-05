/**
 * Der Name eines externen MCP-Servers ist zugleich sein Werkzeug-Präfix in der CLI
 * (`mcp__<name>__werkzeug`). Er muss deshalb klein, auf `[a-z0-9_-]` beschränkt und eindeutig
 * sein — und er darf nicht `orchestrator` lauten, sonst überschriebe er den eigenen Server.
 */
const NAME_MAX_LENGTH = 40

/** Namen, die der eigene Server beansprucht. */
export const RESERVED_MCP_SERVER_NAMES: readonly string[] = ['orchestrator']

/**
 * Name ohne Eindeutigkeitszähler. Main und Renderer teilen sich die Funktion, damit die
 * Live-Vorschau im Editor genau das zeigt, was gespeichert wird. Doppelte Unterstriche werden
 * zu einem zusammengezogen: `mcp__a__b__werkzeug` ließe sonst nicht erkennen, wo der
 * Servername endet.
 */
export function baseMcpServerName(raw: string): string {
  return (
    raw
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/_+/g, '_')
      .replace(/^[-_]+/, '')
      .slice(0, NAME_MAX_LENGTH)
      .replace(/[-_]+$/, '') || 'server'
  )
}

/** `mcp__<name>__` — das Muster, mit dem `allowedTools` die Werkzeuge des Servers freigibt. */
export function mcpToolPattern(name: string): string {
  return `mcp__${name}__*`
}

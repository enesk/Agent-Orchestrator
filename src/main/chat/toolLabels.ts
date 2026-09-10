import { isTranslationKey } from '@shared/i18n'
import { MCP_TOOL_PREFIX } from '../mcp'
import { mainT } from '../app/settings'

/**
 * Beschriftung der eigenen Werkzeuge in der eingestellten Sprache; alles andere behält seinen
 * CLI-Namen. Die Beschriftung wird beim Schreiben festgehalten — ältere Nachrichten behalten
 * deshalb die Sprache, in der sie entstanden sind.
 */
export function toolLabel(name: string): string {
  const short = name.startsWith(MCP_TOOL_PREFIX) ? name.slice(MCP_TOOL_PREFIX.length) : name
  const key = `main.tool.${short}`
  return isTranslationKey(key) ? mainT()(key) : short
}

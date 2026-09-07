import { MCP_TOOL_PREFIX } from '../mcp'

/** Deutsche Beschriftung der eigenen Werkzeuge; alles andere behält seinen CLI-Namen. */
const LABELS: Record<string, string> = {
  ticket_create: 'Ticket anlegen',
  ticket_update: 'Ticket ändern',
  ticket_comment: 'Ticket kommentieren',
  ticket_list: 'Tickets lesen',
  ticket_get: 'Ticket lesen',
  doc_save: 'Dokument speichern',
  doc_get: 'Dokument lesen',
  doc_list: 'Dokumente auflisten',
  memory_save: 'Merken',
  memory_delete: 'Erinnerung löschen',
  goal_report: 'Rückmeldung',
}

export function toolLabel(name: string): string {
  const short = name.startsWith(MCP_TOOL_PREFIX) ? name.slice(MCP_TOOL_PREFIX.length) : name
  return LABELS[short] ?? short
}

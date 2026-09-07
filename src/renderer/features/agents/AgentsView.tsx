import { EmptyState } from '../../ui'
import { AgentIcon } from '../../ui/icons'

/** Platzhalter — wird von einem späteren Ticket gefüllt. */
export function AgentsView() {
  return <EmptyState title="Agenten" description="Hier entsteht die Verwaltung der Agenten und ihrer Rollen." icon={<AgentIcon />} />
}

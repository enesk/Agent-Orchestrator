import { EmptyState } from '../../ui'
import { TicketIcon } from '../../ui/icons'

/** Platzhalter — wird von einem späteren Ticket gefüllt. */
export function TicketsView() {
  return <EmptyState title="Tickets" description="Hier entsteht das Ticket-Board des Projekts." icon={<TicketIcon />} />
}

import { EmptyState } from '../../ui'
import { ChatIcon } from '../../ui/icons'

/** Platzhalter — wird von einem späteren Ticket gefüllt. */
export function ChatView() {
  return <EmptyState title="Chat" description="Hier entsteht die Unterhaltung mit den Agenten des Projekts." icon={<ChatIcon />} />
}

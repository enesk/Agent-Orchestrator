import { EmptyState } from '../../ui'
import { DocumentIcon } from '../../ui/icons'

/** Platzhalter — wird von einem späteren Ticket gefüllt. */
export function DocumentsView() {
  return <EmptyState title="Dokumente" description="Hier entstehen die Dokumente, die Agenten schreiben." icon={<DocumentIcon />} />
}

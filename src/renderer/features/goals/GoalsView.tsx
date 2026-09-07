import { EmptyState } from '../../ui'
import { GoalIcon } from '../../ui/icons'

/** Platzhalter — wird von einem späteren Ticket gefüllt. */
export function GoalsView() {
  return <EmptyState title="Vorhaben" description="Hier entsteht der autonome Ablauf vom Pflichtenheft bis zum Review." icon={<GoalIcon />} />
}

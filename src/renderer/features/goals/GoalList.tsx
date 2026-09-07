import type { Goal, Ticket } from '@shared/types'
import { Badge, cn, formatDateTime } from '../../ui'
import {
  formatDuration,
  goalStatusLabel,
  goalStatusTone,
  isGoalActive,
  phaseLabel,
  ticketCounts,
} from './goalHelpers'

export interface GoalListProps {
  goals: Goal[]
  tickets: Ticket[]
  selectedId: number | null
  now: number
  onSelect: (goalId: number) => void
}

export function GoalList({ goals, tickets, selectedId, now, onSelect }: GoalListProps) {
  return (
    <ul className="space-y-1 p-2">
      {goals.map((goal) => {
        const counts = ticketCounts(goal, tickets)
        return (
          <li key={goal.id}>
            <button
              type="button"
              onClick={() => onSelect(goal.id)}
              className={cn(
                'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                goal.id === selectedId
                  ? 'border-accent/40 bg-accent-soft'
                  : 'border-transparent hover:bg-raised',
              )}
            >
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {goal.title}
                </span>
                <Badge tone={goalStatusTone(goal.status)}>{goalStatusLabel(goal.status)}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint">
                <span>{phaseLabel(goal)}</span>
                {counts && (
                  <span>
                    {counts.done}/{counts.total} Tickets
                  </span>
                )}
                <span>{formatDateTime(goal.createdAt)}</span>
                <span>{formatDuration(goal, now)}</span>
                {isGoalActive(goal) && <span className="text-accent">läuft</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

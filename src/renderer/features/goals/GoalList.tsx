import type { Goal, Ticket } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { Badge, cn } from '../../ui'
import {
  formatGoalDuration,
  goalStatusLabelKey,
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
  const t = useT()
  const format = useFormat()
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
                <Badge tone={goalStatusTone(goal.status)}>{t(goalStatusLabelKey(goal.status))}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint">
                <span>{phaseLabel(goal, t)}</span>
                {counts && (
                  <span>{t('goals.list.tickets', { done: counts.done, total: counts.total })}</span>
                )}
                <span>{format.dateTime(goal.createdAt)}</span>
                <span>{formatGoalDuration(goal, now, t)}</span>
                {isGoalActive(goal) && <span className="text-accent">{t('goals.list.running')}</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

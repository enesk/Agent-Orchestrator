import type { Goal } from '@shared/types'
import { cn } from '../../ui'
import { CheckIcon } from '../../ui/icons'
import { GOAL_PHASES, isGoalActive, resolvePhase } from './goalHelpers'

export interface PhaseBarProps {
  goal: Goal
}

export function PhaseBar({ goal }: PhaseBarProps) {
  const currentKey = resolvePhase(goal)
  const currentIndex = GOAL_PHASES.findIndex((phase) => phase.key === currentKey)
  const finished = goal.status === 'done'
  const running = isGoalActive(goal)

  return (
    <ol className="flex items-center gap-1">
      {GOAL_PHASES.map((phase, index) => {
        const done = finished || index < currentIndex
        const current = !finished && index === currentIndex

        return (
          <li key={phase.key} className="flex min-w-0 flex-1 items-center gap-1">
            <div
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors',
                done && 'border-success/30 bg-success/10 text-success',
                current && 'border-accent/40 bg-accent-soft text-accent',
                !done && !current && 'border-line bg-surface text-ink-faint',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]',
                  done && 'bg-success/20',
                  current && 'bg-accent/20',
                  !done && !current && 'border border-line',
                )}
              >
                {done ? (
                  <CheckIcon width={11} height={11} />
                ) : current && running ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                ) : null}
              </span>
              <span className="truncate text-xs font-medium">{phase.label}</span>
            </div>
            {index < GOAL_PHASES.length - 1 && (
              <span
                className={cn(
                  'h-px w-3 shrink-0 transition-colors',
                  done ? 'bg-success/40' : 'bg-line',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

import type { AgentStatusUpdate, ProjectAgent } from '@shared/types'
import { useT } from '../../i18n'
import { Tooltip, cn } from '../../ui'
import { ACTIVITY_DOT_CLASSES, ACTIVITY_LABEL_KEYS } from './chatHelpers'

export interface AgentBarProps {
  agents: ProjectAgent[]
  activity: Record<string, AgentStatusUpdate>
  busyIds: Set<string>
  onMention: (agent: ProjectAgent) => void
  onToggleStopped: (agent: ProjectAgent) => void
}

export function AgentBar({ agents, activity, busyIds, onMention, onToggleStopped }: AgentBarProps) {
  const t = useT()

  if (agents.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-ink-faint">
        {t('chat.agentBar.empty')}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
      {agents.map((agent) => {
        const status = activity[agent.id]
        const state = agent.stopped ? null : status?.activity ?? 'idle'
        const detail = agent.stopped
          ? t('chat.agentBar.stopped')
          : status?.detail ?? (state ? t(ACTIVITY_LABEL_KEYS[state]) : '')

        return (
          <div
            key={agent.id}
            className={cn(
              'flex items-center gap-2 rounded-md border border-line bg-surface py-1 pl-2 pr-1',
              agent.stopped && 'opacity-60',
            )}
          >
            <button
              type="button"
              onClick={() => onMention(agent)}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              <span className="truncate text-xs font-medium text-ink">{agent.name}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    agent.stopped ? 'bg-ink-faint' : ACTIVITY_DOT_CLASSES[state ?? 'idle'],
                  )}
                />
                <span className="max-w-[10rem] truncate text-[11px] text-ink-faint">{detail}</span>
              </span>
            </button>
            <Tooltip label={agent.stopped ? t('chat.agentBar.resume') : t('chat.agentBar.stop')}>
              <button
                type="button"
                disabled={busyIds.has(agent.id)}
                onClick={() => onToggleStopped(agent)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                  agent.stopped
                    ? 'text-success hover:bg-raised'
                    : 'text-ink-faint hover:bg-raised hover:text-ink',
                )}
              >
                {agent.stopped ? t('chat.agentBar.start') : t('chat.agentBar.stopShort')}
              </button>
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}

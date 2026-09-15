import type { ProjectAgent } from '@shared/types'
import { useT } from '../../i18n'
import { Badge, cn } from '../../ui'
import { AgentAvatar } from './AgentAvatar'
import { modelLabel, roleLabelKey } from './agentHelpers'

export interface AgentListProps {
  agents: ProjectAgent[]
  selectedId: string | null
  onSelect: (agentId: string) => void
}

export function AgentList({ agents, selectedId, onSelect }: AgentListProps) {
  const t = useT()
  return (
    <ul className="min-h-0 flex-1 overflow-auto p-2">
      {agents.length === 0 && (
        <li className="px-1 py-4 text-center text-xs text-ink-faint">{t('agent.list.empty')}</li>
      )}
      {agents.map((agent) => (
        <li key={agent.id}>
          <button
            type="button"
            onClick={() => onSelect(agent.id)}
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
              agent.id === selectedId ? 'bg-accent-soft' : 'hover:bg-raised',
            )}
          >
            <AgentAvatar name={agent.name} color={agent.color} avatar={agent.avatar} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-ink">{agent.name}</span>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                {agent.title ?? agent.mentionKey} · {modelLabel(agent.model)}
                {agent.skillIds.length > 0 &&
                  ` · ${t('agents.list.skillCount', { count: agent.skillIds.length })}`}
              </span>
            </span>
            <Badge className="shrink-0">{t(roleLabelKey(agent.role))}</Badge>
          </button>
        </li>
      ))}
    </ul>
  )
}

import { AGENT_ROLES } from '@shared/constants'
import type { ProjectAgent } from '@shared/types'
import { cn } from '../../ui'

function roleLabel(role: ProjectAgent['role']): string {
  return AGENT_ROLES.find((option) => option.value === role)?.label ?? role
}

export interface AgentPickerProps {
  agents: ProjectAgent[]
  selectedIds: string[]
  onChange: (agentIds: string[]) => void
}

/** Mehrfachauswahl der Agenten, die als Worker eingesetzt werden dürfen. */
export function AgentPicker({ agents, selectedIds, onChange }: AgentPickerProps) {
  function toggle(agentId: string): void {
    onChange(
      selectedIds.includes(agentId)
        ? selectedIds.filter((id) => id !== agentId)
        : [...selectedIds, agentId],
    )
  }

  if (agents.length === 0) {
    return (
      <p className="rounded-md border border-line bg-raised px-2 py-1.5 text-xs text-ink-muted">
        Dem Projekt ist kein Agent zugeordnet. Lege im Bereich „Agenten" mindestens einen an.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {agents.map((agent) => {
        const checked = selectedIds.includes(agent.id)
        return (
          <label
            key={agent.id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors',
              checked ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface hover:bg-raised',
            )}
          >
            <input
              type="checkbox"
              className="accent-accent"
              checked={checked}
              onChange={() => toggle(agent.id)}
            />
            <span
              aria-hidden="true"
              style={{ backgroundColor: agent.color }}
              className="h-2 w-2 shrink-0 rounded-full"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{agent.name}</span>
            <span className="shrink-0 text-[11px] text-ink-faint">{roleLabel(agent.role)}</span>
          </label>
        )
      })}
    </div>
  )
}

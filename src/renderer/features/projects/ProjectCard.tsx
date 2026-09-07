import type { Project } from '@shared/types'
import { Button, cn, formatDateTime } from '../../ui'
import { AgentIcon, TicketIcon } from '../../ui/icons'

export interface ProjectStats {
  agents: number
  openTickets: number
}

export interface ProjectCardProps {
  project: Project
  stats: ProjectStats | undefined
  active: boolean
  pathWarning: string | null
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ProjectCard({
  project,
  stats,
  active,
  pathWarning,
  onOpen,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  return (
    <article
      className={cn(
        'group flex flex-col rounded-lg border bg-surface p-3 transition-colors',
        active ? 'border-accent' : 'border-line hover:border-line-strong',
      )}
    >
      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <h3 className="truncate text-sm font-medium text-ink">{project.name}</h3>
        <p className="mt-1 line-clamp-2 h-8 text-xs text-ink-muted">
          {project.description ?? 'Keine Beschreibung'}
        </p>
        <p
          className={cn(
            'mt-2 truncate font-mono text-[11px]',
            pathWarning ? 'text-warning' : 'text-ink-faint',
          )}
          title={pathWarning ?? project.path ?? undefined}
        >
          {project.path ?? 'Kein Projektpfad hinterlegt'}
        </p>
      </button>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <AgentIcon width={13} height={13} />
          {stats ? stats.agents : '–'} Agenten
        </span>
        <span className="inline-flex items-center gap-1">
          <TicketIcon width={13} height={13} />
          {stats ? stats.openTickets : '–'} offen
        </span>
        <span className="ml-auto truncate">{formatDateTime(project.updatedAt)}</span>
      </div>

      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button size="sm" onClick={onEdit}>
          Bearbeiten
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Löschen
        </Button>
      </div>
    </article>
  )
}

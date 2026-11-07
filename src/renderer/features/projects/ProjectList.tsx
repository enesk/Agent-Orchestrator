import type { Project } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { useProjectBusy } from '../../store/activityStore'
import type { ProjectSort, ProjectSortKey } from '../../store/uiStore'
import { cn } from '../../ui'

export interface ProjectStats {
  agents: number
  openTickets: number
  /** Jüngstes Ereignis des Projekts — Ticket, Nachricht oder das Projekt selbst. */
  lastActivityAt: string
}

/**
 * Spaltenraster aus dem Mockup: schmal nur Name, Offen und Aktivität; ab 640 px kommen
 * Beschreibung und Agentenzahl dazu.
 */
const GRID = cn(
  'grid items-center gap-3 px-3.5 wide:px-5',
  'grid-cols-[1fr_auto_58px]',
  'sm:grid-cols-[minmax(140px,1fr)_minmax(0,1.4fr)_56px_76px_96px]',
)

interface ProjectListProps {
  projects: Project[]
  stats: Record<string, ProjectStats>
  sort: ProjectSort
  onSort: (key: ProjectSortKey) => void
  onOpen: (projectId: string) => void
  onContextMenu: (project: Project, position: { x: number; y: number }) => void
}

export function ProjectList({
  projects,
  stats,
  sort,
  onSort,
  onOpen,
  onContextMenu,
}: ProjectListProps) {
  const t = useT()

  const sortButton = (key: ProjectSortKey, label: string, align: 'left' | 'right') => {
    const active = sort.key === key
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={cn(
          'flex items-center gap-1',
          align === 'right' ? 'justify-end' : 'justify-start',
          active ? 'text-ui-text-2' : 'text-ui-text-3',
        )}
      >
        {label}
        {active && (
          <span
            aria-hidden="true"
            className={cn(
              'h-0 w-0 border-[3.5px] border-transparent',
              sort.direction === 'desc'
                ? 'mt-[3px] border-t-current'
                : 'mb-[3px] border-b-current',
            )}
          />
        )}
      </button>
    )
  }

  return (
    <div className="max-w-[1040px] text-[13px] leading-[1.4]">
      <div
        className={cn(
          GRID,
          'sticky top-[50px] z-[4] h-[30px] border-b border-ui-line bg-ui-bg text-[11px] text-ui-text-3',
        )}
      >
        {sortButton('name', t('home.column.project'), 'left')}
        <span className="hidden sm:block" />
        {sortButton('open', t('home.column.open'), 'right')}
        <span className="hidden text-right sm:block">{t('home.column.agents')}</span>
        {sortButton('activity', t('home.column.activity'), 'right')}
      </div>

      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          stats={stats[project.id]}
          onOpen={() => onOpen(project.id)}
          onContextMenu={(position) => onContextMenu(project, position)}
        />
      ))}
    </div>
  )
}

interface ProjectRowProps {
  project: Project
  stats: ProjectStats | undefined
  onOpen: () => void
  onContextMenu: (position: { x: number; y: number }) => void
}

function ProjectRow({ project, stats, onOpen, onContextMenu }: ProjectRowProps) {
  const t = useT()
  const format = useFormat()
  const busy = useProjectBusy(project.id)

  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu({ x: event.clientX, y: event.clientY })
      }}
      className={cn(GRID, 'h-9 w-full border-b border-ui-line text-left hover:bg-ui-panel-2')}
    >
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <span className="truncate">{project.name}</span>
        {busy && (
          <i
            title={t('home.agentWorking')}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-ui-ok"
          />
        )}
      </span>

      <span className="hidden truncate text-ui-text-3 sm:block">{project.description ?? ''}</span>

      {stats && stats.openTickets > 0 ? (
        <span className="text-right font-medium tabular-nums text-ui-warn">
          {stats.openTickets}
        </span>
      ) : (
        <span className="text-right font-medium tabular-nums text-ui-line-2">–</span>
      )}

      <span className="hidden text-right tabular-nums text-ui-text-3 sm:block">
        {stats?.agents ?? ''}
      </span>

      <span className="whitespace-nowrap text-right tabular-nums text-ui-text-3">
        {format.activityStamp(stats?.lastActivityAt || project.updatedAt)}
      </span>
    </button>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, cn, useConfirm } from '../../ui'
import { ListIcon, PlusIcon } from '../../ui/icons'
import { ProjectFormModal } from '../projects/ProjectFormModal'
import { ProjectList, type ProjectStats } from '../projects/ProjectList'

type Filter = 'all' | 'open'

interface RowMenu {
  project: Project
  x: number
  y: number
}

/** Der jüngste der übergebenen Zeitstempel. */
function latest(...stamps: (string | undefined)[]): string {
  return stamps.filter((stamp): stamp is string => Boolean(stamp)).sort().at(-1) ?? ''
}

export function HomeView() {
  const t = useT()
  const projects = useProjectStore((state) => state.projects)
  const storeError = useProjectStore((state) => state.error)
  const loading = useProjectStore((state) => state.loading)
  const removeProject = useProjectStore((state) => state.remove)

  const setActiveProject = useUiStore((state) => state.setActiveProject)
  const setActiveSection = useUiStore((state) => state.setActiveSection)
  const sort = useUiStore((state) => state.projectSort)
  const sortProjects = useUiStore((state) => state.sortProjects)

  const [stats, setStats] = useState<Record<string, ProjectStats>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Project | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [menu, setMenu] = useState<RowMenu | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const projectIds = projects.map((project) => project.id).join(',')

  /**
   * Offene Tickets, Agentenzahl und der Zeitpunkt der letzten Aktivität. Letzterer steht
   * nirgends als Feld, also wird er aus dem jüngsten Ticket, der jüngsten Nachricht und dem
   * Projekt selbst abgeleitet.
   */
  const loadStats = useCallback(async (ids: string[]): Promise<void> => {
    const entries = await Promise.all(
      ids.map(async (projectId): Promise<[string, ProjectStats]> => {
        const [agents, tickets, lastMessages] = await Promise.all([
          window.api.agents.list({ projectId }),
          window.api.tickets.list({ projectId }),
          window.api.chat.history({ projectId, limit: 1 }),
        ])
        return [
          projectId,
          {
            agents: agents.length,
            openTickets: tickets.filter((ticket) => ticket.status === 'open').length,
            lastActivityAt: latest(
              ...tickets.map((ticket) => ticket.updatedAt),
              lastMessages[0]?.createdAt,
            ),
          },
        ]
      }),
    )
    setStats(Object.fromEntries(entries))
  }, [])

  useEffect(() => {
    const ids = projectIds ? projectIds.split(',') : []
    if (ids.length === 0) {
      setStats({})
      return
    }
    void loadStats(ids)

    // Tickets und Zuordnungen ändern sich auch durch Agenten im Hintergrund.
    const unsubscribeTickets = window.api.on('ticket.changed', () => void loadStats(ids))
    const unsubscribeAgents = window.api.on('agent.changed', () => void loadStats(ids))
    // Nachrichten kommen im Stream alle paar Millisekunden — die rühren nur am Zeitstempel.
    const unsubscribeMessages = window.api.on('chat.message', ({ projectId, message }) => {
      setStats((current) => {
        const entry = current[projectId]
        if (!entry || entry.lastActivityAt >= message.createdAt) return current
        return { ...current, [projectId]: { ...entry, lastActivityAt: message.createdAt } }
      })
    })
    return () => {
      unsubscribeTickets()
      unsubscribeAgents()
      unsubscribeMessages()
    }
  }, [projectIds, loadStats])

  const openCount = projects.filter((project) => (stats[project.id]?.openTickets ?? 0) > 0).length

  const rows = useMemo(() => {
    const visible =
      filter === 'open'
        ? projects.filter((project) => (stats[project.id]?.openTickets ?? 0) > 0)
        : projects
    const factor = sort.direction === 'desc' ? -1 : 1
    return [...visible].sort((a, b) => {
      if (sort.key === 'name') return factor * a.name.localeCompare(b.name, t.locale)
      if (sort.key === 'open') {
        return factor * ((stats[a.id]?.openTickets ?? 0) - (stats[b.id]?.openTickets ?? 0))
      }
      const stampA = stats[a.id]?.lastActivityAt || a.updatedAt
      const stampB = stats[b.id]?.lastActivityAt || b.updatedAt
      return factor * stampA.localeCompare(stampB)
    })
  }, [projects, stats, filter, sort, t])

  function openProject(projectId: string): void {
    setActiveProject(projectId)
    setActiveSection('chat')
  }

  function createProject(): void {
    setEditing(null)
    setFormOpen(true)
  }

  async function deleteProject(project: Project): Promise<void> {
    const confirmed = await confirm({
      title: t('home.delete.title'),
      message: t('home.delete.message', { name: project.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    setActionError(null)
    try {
      await removeProject(project.id)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }

  if (storeError) {
    return <EmptyState title={t('home.loadFailed')} description={storeError} icon={<ListIcon />} />
  }

  if (!loading && projects.length === 0) {
    return (
      <>
        <EmptyState
          title={t('home.empty.title')}
          description={t('home.empty.description')}
          icon={<ListIcon />}
          action={
            <Button
              variant="primary"
              icon={<PlusIcon width={16} height={16} />}
              onClick={createProject}
            >
              {t('home.newProject')}
            </Button>
          }
        />
        <ProjectFormModal open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      </>
    )
  }

  return (
    <div className="min-h-full bg-ui-bg font-sans text-[13px] leading-[1.4] text-ui-text">
      <header
        className={cn(
          'sticky top-0 z-[5] flex items-center gap-2.5 px-3.5 py-[10px] wide:px-5',
          'border-b border-ui-line bg-ui-panel',
        )}
      >
        <h1 className="text-[14px] font-semibold">{t('home.title')}</h1>
        <span className="text-ui-text-3">{projects.length}</span>

        <div className="ml-auto flex items-center gap-1.5">
          <HeaderButton active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('home.filter.all')}
          </HeaderButton>
          <HeaderButton active={filter === 'open'} onClick={() => setFilter('open')}>
            {t('home.filter.open')} <span className="text-ui-warn">{openCount}</span>
          </HeaderButton>
          <button
            type="button"
            onClick={createProject}
            title={t('home.newProject')}
            className={cn(
              'inline-flex items-center gap-[5px] rounded border px-2.5 py-[5px]',
              'border-ui-accent bg-ui-accent text-[12.5px] font-medium text-ui-accent-ink',
            )}
          >
            <PlusIcon width={15} height={15} strokeWidth={1.7} />
            <span className="hidden wide:inline">{t('home.new')}</span>
          </button>
        </div>
      </header>

      {actionError && (
        <p className="mx-3.5 mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger wide:mx-5">
          {actionError}
        </p>
      )}

      <ProjectList
        projects={rows}
        stats={stats}
        sort={sort}
        onSort={sortProjects}
        onOpen={openProject}
        onContextMenu={(project, position) =>
          setMenu({ project, x: position.x, y: position.y })
        }
      />

      {menu && (
        <RowMenuPopover
          onClose={() => setMenu(null)}
          x={menu.x}
          y={menu.y}
          onEdit={() => {
            setEditing(menu.project)
            setFormOpen(true)
          }}
          onDelete={() => void deleteProject(menu.project)}
        />
      )}

      <ProjectFormModal open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      {dialog}
    </div>
  )
}

function HeaderButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-[5px] rounded border border-transparent px-2.5 py-[5px]',
        'text-[12.5px] font-medium',
        active ? 'bg-ui-panel-2 text-ui-text' : 'bg-transparent text-ui-text-2',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Bearbeiten und Löschen hängen an der rechten Maustaste: die Liste selbst zeigt nach dem
 * Mockup nur Daten, erreichbar bleiben müssen beide Aktionen trotzdem.
 */
function RowMenuPopover({
  x,
  y,
  onEdit,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const item = 'block w-full px-2.5 py-1.5 text-left text-[12.5px] hover:bg-ui-panel-2'

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('home.rowActions')}
      style={{ left: Math.min(x, window.innerWidth - 160), top: y }}
      className="fixed z-20 w-[150px] rounded border border-ui-line-2 bg-ui-panel py-1 text-ui-text"
    >
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          onClose()
          onEdit()
        }}
      >
        {t('common.edit')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={cn(item, 'text-danger')}
        onClick={() => {
          onClose()
          onDelete()
        }}
      >
        {t('common.delete')}
      </button>
    </div>
  )
}

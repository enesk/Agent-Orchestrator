import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Spinner, useConfirm } from '../../ui'
import { HomeIcon, PlusIcon } from '../../ui/icons'
import { ProjectCard, type ProjectStats } from '../projects/ProjectCard'
import { ProjectFormModal } from '../projects/ProjectFormModal'

export function HomeView() {
  const projects = useProjectStore((state) => state.projects)
  const loading = useProjectStore((state) => state.loading)
  const storeError = useProjectStore((state) => state.error)
  const pathWarnings = useProjectStore((state) => state.pathWarnings)
  const removeProject = useProjectStore((state) => state.remove)

  const activeProjectId = useUiStore((state) => state.activeProjectId)
  const setActiveProject = useUiStore((state) => state.setActiveProject)
  const setActiveSection = useUiStore((state) => state.setActiveSection)

  const [stats, setStats] = useState<Record<string, ProjectStats>>({})
  const [editing, setEditing] = useState<Project | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const projectIds = projects.map((project) => project.id).join(',')

  const loadStats = useCallback(async (ids: string[]): Promise<void> => {
    const entries = await Promise.all(
      ids.map(async (projectId): Promise<[string, ProjectStats]> => {
        const [agents, tickets] = await Promise.all([
          window.api.agents.list({ projectId }),
          window.api.tickets.list({ projectId, status: 'open' }),
        ])
        return [projectId, { agents: agents.length, openTickets: tickets.length }]
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
    return () => {
      unsubscribeTickets()
      unsubscribeAgents()
    }
  }, [projectIds, loadStats])

  function openProject(projectId: string): void {
    setActiveProject(projectId)
    setActiveSection('chat')
  }

  async function deleteProject(project: Project): Promise<void> {
    const confirmed = await confirm({
      title: 'Projekt löschen',
      message: `Projekt „${project.name}" endgültig löschen? Tickets, Dokumente und der Chatverlauf gehen mit.`,
      confirmLabel: 'Löschen',
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
    return (
      <EmptyState
        title="Projekte konnten nicht geladen werden"
        description={storeError}
        icon={<HomeIcon />}
      />
    )
  }

  if (!loading && projects.length === 0) {
    return (
      <>
        <EmptyState
          title="Noch kein Projekt"
          description="Lege ein Projekt an und ordne ihm einen Ordner auf der Platte zu."
          icon={<HomeIcon />}
          action={
            <Button
              variant="primary"
              icon={<PlusIcon width={16} height={16} />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Neues Projekt
            </Button>
          }
        />
        <ProjectFormModal open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      </>
    )
  }

  return (
    <div className="p-4">
      <header className="mb-3 flex items-center gap-2">
        <h1 className="text-sm font-medium text-ink">Projekte</h1>
        {loading && <Spinner size={14} />}
        <div className="flex-1" />
      </header>

      {actionError && (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
          {actionError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            stats={stats[project.id]}
            active={project.id === activeProjectId}
            pathWarning={pathWarnings[project.id] ?? null}
            onOpen={() => openProject(project.id)}
            onEdit={() => {
              setEditing(project)
              setFormOpen(true)
            }}
            onDelete={() => void deleteProject(project)}
          />
        ))}

        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          className="flex min-h-[132px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          <PlusIcon width={20} height={20} />
          <span className="text-xs font-medium">Neues Projekt</span>
        </button>
      </div>

      <ProjectFormModal open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      {dialog}
    </div>
  )
}

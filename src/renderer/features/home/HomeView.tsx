import { useProjectStore } from '../../store/projectStore'
import { EmptyState } from '../../ui'
import { HomeIcon } from '../../ui/icons'

export function HomeView() {
  const projects = useProjectStore((state) => state.projects)
  const error = useProjectStore((state) => state.error)

  if (error) {
    return (
      <EmptyState
        title="Projekte konnten nicht geladen werden"
        description={error}
        icon={<HomeIcon />}
      />
    )
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="Noch kein Projekt"
        description="Lege ein Projekt an und ordne ihm einen Ordner auf der Platte zu."
        icon={<HomeIcon />}
      />
    )
  }

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <article key={project.id} className="rounded-lg border border-line bg-surface p-3">
          <h3 className="truncate text-sm font-medium text-ink">{project.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
            {project.description ?? 'Keine Beschreibung'}
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-ink-faint">
            {project.path ?? 'Kein Projektpfad hinterlegt'}
          </p>
        </article>
      ))}
    </div>
  )
}

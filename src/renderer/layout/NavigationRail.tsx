import { useT } from '../i18n'
import { useProjectStore } from '../store/projectStore'
import { SECTION_LABEL_KEYS, useUiStore, type Section } from '../store/uiStore'
import { Tooltip, cn } from '../ui'
import {
  AgentIcon,
  ChatIcon,
  DocumentIcon,
  GoalIcon,
  HomeIcon,
  SettingsIcon,
  TicketIcon,
} from '../ui/icons'
import type { ComponentType, SVGProps } from 'react'

const SECTIONS: { id: Section; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'home', Icon: HomeIcon },
  { id: 'chat', Icon: ChatIcon },
  { id: 'tickets', Icon: TicketIcon },
  { id: 'documents', Icon: DocumentIcon },
  { id: 'goals', Icon: GoalIcon },
  { id: 'agents', Icon: AgentIcon },
]

export function NavigationRail() {
  const t = useT()
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useUiStore((state) => state.activeProjectId)
  const setActiveProject = useUiStore((state) => state.setActiveProject)
  const activeSection = useUiStore((state) => state.activeSection)
  const setActiveSection = useUiStore((state) => state.setActiveSection)

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-base pb-2">
      <div className="drag-region h-11 w-full" />

      <div className="flex w-full flex-col items-center gap-1 px-2">
        {projects.map((project) => (
          <Tooltip key={project.id} label={project.name} side="right">
            <button
              type="button"
              onClick={() => setActiveProject(project.id)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold uppercase transition-colors',
                project.id === activeProjectId
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-raised text-ink-muted hover:text-ink',
              )}
            >
              {project.name.slice(0, 2)}
            </button>
          </Tooltip>
        ))}
      </div>

      {projects.length > 0 && <div className="my-1 h-px w-8 bg-line" />}

      <div className="flex w-full flex-col items-center gap-1 px-2">
        {SECTIONS.map(({ id, Icon }) => (
          <Tooltip key={id} label={t(SECTION_LABEL_KEYS[id])} side="right">
            <button
              type="button"
              aria-label={t(SECTION_LABEL_KEYS[id])}
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                activeSection === id
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-muted hover:bg-raised hover:text-ink',
              )}
            >
              <Icon />
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="mt-auto px-2">
        <Tooltip label={t('nav.settings')} side="right">
          <button
            type="button"
            aria-label={t('nav.settings')}
            aria-current={activeSection === 'settings' ? 'page' : undefined}
            onClick={() => setActiveSection('settings')}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              activeSection === 'settings'
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:bg-raised hover:text-ink',
            )}
          >
            <SettingsIcon />
          </button>
        </Tooltip>
      </div>
    </nav>
  )
}

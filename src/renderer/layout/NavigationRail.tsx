import { useT } from '../i18n'
import { useProjectStore } from '../store/projectStore'
import { SECTION_LABEL_KEYS, useUiStore, type Section } from '../store/uiStore'
import { Tooltip, cn } from '../ui'
import {
  AgentIcon,
  ChatIcon,
  ChevronRightIcon,
  DocumentIcon,
  GoalIcon,
  HomeIcon,
  SettingsIcon,
  TicketIcon,
} from '../ui/icons'
import type { ComponentType, ReactNode, SVGProps } from 'react'

const SECTIONS: { id: Section; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'home', Icon: HomeIcon },
  { id: 'chat', Icon: ChatIcon },
  { id: 'tickets', Icon: TicketIcon },
  { id: 'documents', Icon: DocumentIcon },
  { id: 'goals', Icon: GoalIcon },
  { id: 'agents', Icon: AgentIcon },
]

/**
 * Eingeklappt trägt der Tooltip die Beschriftung, ausgeklappt steht sie im Knopf — dann wäre
 * das Tooltip eine Dopplung und bleibt weg.
 */
function RailLabel({ expanded, label, children }: {
  expanded: boolean
  label: string
  children: ReactNode
}) {
  if (expanded) return <>{children}</>
  return (
    <Tooltip label={label} side="right">
      {children}
    </Tooltip>
  )
}

export function NavigationRail() {
  const t = useT()
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useUiStore((state) => state.activeProjectId)
  const setActiveProject = useUiStore((state) => state.setActiveProject)
  const activeSection = useUiStore((state) => state.activeSection)
  const setActiveSection = useUiStore((state) => state.setActiveSection)
  const expanded = useUiStore((state) => state.navExpanded)
  const toggleNavExpanded = useUiStore((state) => state.toggleNavExpanded)

  const sectionButton = (id: Section, Icon: ComponentType<SVGProps<SVGSVGElement>>) => {
    const label = t(SECTION_LABEL_KEYS[id])
    return (
      <RailLabel key={id} expanded={expanded} label={label}>
        <button
          type="button"
          aria-label={label}
          aria-current={activeSection === id ? 'page' : undefined}
          onClick={() => setActiveSection(id)}
          className={cn(
            'flex h-9 items-center rounded-md transition-colors',
            expanded ? 'w-full gap-2.5 px-2' : 'w-9 justify-center',
            activeSection === id
              ? 'bg-accent-soft text-accent'
              : 'text-ink-muted hover:bg-raised hover:text-ink',
          )}
        >
          <Icon className="shrink-0" />
          {expanded && <span className="truncate text-sm">{label}</span>}
        </button>
      </RailLabel>
    )
  }

  return (
    <nav
      className={cn(
        'flex shrink-0 flex-col gap-1 border-r border-line bg-base pb-2',
        'transition-[width] duration-200',
        expanded ? 'w-52 items-stretch' : 'w-14 items-center',
      )}
    >
      <div className="drag-region h-11 w-full" />

      <div className={cn('flex w-full flex-col gap-1 px-2', !expanded && 'items-center')}>
        {projects.map((project) => (
          <RailLabel key={project.id} expanded={expanded} label={project.name}>
            <button
              type="button"
              onClick={() => setActiveProject(project.id)}
              className={cn(
                'flex h-9 items-center rounded-md border transition-colors',
                expanded ? 'w-full gap-2.5 px-2' : 'w-9 justify-center',
                project.id === activeProjectId
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-raised text-ink-muted hover:text-ink',
              )}
            >
              <span className="w-5 shrink-0 text-center text-xs font-semibold uppercase">
                {project.name.slice(0, 2)}
              </span>
              {expanded && <span className="truncate text-sm">{project.name}</span>}
            </button>
          </RailLabel>
        ))}
      </div>

      {projects.length > 0 && (
        <div className={cn('my-1 h-px bg-line', expanded ? 'mx-2 w-auto' : 'w-8 self-center')} />
      )}

      <div className={cn('flex w-full flex-col gap-1 px-2', !expanded && 'items-center')}>
        {SECTIONS.map(({ id, Icon }) => sectionButton(id, Icon))}
      </div>

      <div className={cn('mt-auto flex w-full flex-col gap-1 px-2', !expanded && 'items-center')}>
        {sectionButton('settings', SettingsIcon)}

        <RailLabel
          expanded={expanded}
          label={expanded ? t('nav.collapse') : t('nav.expand')}
        >
          <button
            type="button"
            aria-label={expanded ? t('nav.collapse') : t('nav.expand')}
            aria-expanded={expanded}
            onClick={toggleNavExpanded}
            className={cn(
              'flex h-9 items-center rounded-md text-ink-muted transition-colors',
              'hover:bg-raised hover:text-ink',
              expanded ? 'w-full gap-2.5 px-2' : 'w-9 justify-center',
            )}
          >
            <ChevronRightIcon
              className={cn('shrink-0 transition-transform', expanded && 'rotate-180')}
            />
            {expanded && <span className="truncate text-sm">{t('nav.collapse')}</span>}
          </button>
        </RailLabel>
      </div>
    </nav>
  )
}

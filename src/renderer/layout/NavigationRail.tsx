import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useQuestionStore } from '../store/questionStore'
import { SECTION_LABEL_KEYS, useUiStore, type Section } from '../store/uiStore'
import { Tooltip, cn } from '../ui'
import {
  AgentIcon,
  ChatIcon,
  ChevronRightIcon,
  DocumentIcon,
  GoalIcon,
  ListIcon,
  PulseIcon,
  QuestionIcon,
  SettingsIcon,
  TicketIcon,
} from '../ui/icons'
import type { ComponentType, ReactNode, SVGProps } from 'react'

const SECTIONS: { id: Section; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'home', Icon: ListIcon },
  { id: 'chat', Icon: ChatIcon },
  { id: 'tickets', Icon: TicketIcon },
  { id: 'documents', Icon: DocumentIcon },
  { id: 'goals', Icon: GoalIcon },
  { id: 'questions', Icon: QuestionIcon },
  { id: 'runs', Icon: PulseIcon },
  { id: 'agents', Icon: AgentIcon },
]

/**
 * Unterhalb dieser Breite lässt das Mockup die Seitenleiste ganz weg. Hier bleibt sie als
 * Symbolspalte stehen — ausgeklappt wäre für die Liste daneben kein Platz mehr.
 */
function useWideViewport(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 980px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 980px)')
    const onChange = (event: MediaQueryListEvent): void => setWide(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

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
  const activeSection = useUiStore((state) => state.activeSection)
  const setActiveSection = useUiStore((state) => state.setActiveSection)
  const navExpanded = useUiStore((state) => state.navExpanded)
  const toggleNavExpanded = useUiStore((state) => state.toggleNavExpanded)
  const openQuestions = useQuestionStore((state) => state.openCount)
  const wide = useWideViewport()
  const expanded = navExpanded && wide

  const sectionButton = (id: Section, Icon: ComponentType<SVGProps<SVGSVGElement>>) => {
    const label = t(SECTION_LABEL_KEYS[id])
    // Offene Rückfragen halten einen Lauf auf; der Zähler ist der einzige Hinweis darauf,
    // solange der Bereich nicht offen ist.
    const count = id === 'questions' ? openQuestions : 0
    return (
      <RailLabel key={id} expanded={expanded} label={label}>
        <button
          type="button"
          aria-label={label}
          aria-current={activeSection === id ? 'page' : undefined}
          onClick={() => setActiveSection(id)}
          className={cn(
            'relative flex h-9 items-center rounded-md transition-colors',
            expanded ? 'w-full gap-2.5 px-2' : 'w-9 justify-center',
            activeSection === id
              ? 'bg-accent-soft text-accent'
              : 'text-ink-muted hover:bg-raised hover:text-ink',
          )}
        >
          <Icon className="shrink-0" />
          {expanded && <span className="truncate text-sm">{label}</span>}
          {count > 0 && (
            <span
              aria-label={t('questions.badge', { count })}
              className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1',
                'text-[10px] font-semibold leading-none text-white',
                expanded ? 'ml-auto' : 'absolute right-1 top-1',
              )}
            >
              {count}
            </span>
          )}
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
        {SECTIONS.map(({ id, Icon }) => sectionButton(id, Icon))}
      </div>

      <div className={cn('mt-auto flex w-full flex-col gap-1 px-2', !expanded && 'items-center')}>
        {sectionButton('settings', SettingsIcon)}

        {wide && (
          <RailLabel expanded={expanded} label={expanded ? t('nav.collapse') : t('nav.expand')}>
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
        )}
      </div>
    </nav>
  )
}

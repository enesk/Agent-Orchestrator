import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Project } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'

type Section = 'home' | 'chat' | 'goals' | 'tickets' | 'documents' | 'project-settings' | 'settings'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  activeSection: Section
  onSelectProject: (id: string) => void
  onSelectSection: (section: Section) => void
  onCreateProject: () => void
}

// Generate a stable color from project name
function projectColor(name: string): string {
  const colors = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#F97316', '#A855F7', '#14B8A6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const NAV_ICONS: Record<Section, React.ReactNode> = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  goals: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  tickets: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  ),
  documents: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  'project-settings': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
}

const NAV_KEYS: Section[] = ['home', 'chat', 'goals', 'tickets', 'documents', 'project-settings', 'settings']
const NAV_LABEL_KEYS = {
  home: 'nav.home' as const,
  chat: 'nav.chat' as const,
  goals: 'nav.goals' as const,
  tickets: 'nav.tickets' as const,
  documents: 'nav.documents' as const,
  'project-settings': 'nav.projectSettings' as const,
  settings: 'nav.settings' as const,
}

export default function NavigationRail({ projects, activeProjectId, activeSection, onSelectProject, onSelectSection, onCreateProject }: Props) {
  const { t } = useLanguage()
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [tooltipY, setTooltipY] = useState(0)

  const showTooltip = (label: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipY(rect.top + rect.height / 2)
    setTooltip(label)
  }

  return (
    <div className="flex flex-col items-center w-[72px] h-full bg-white border-r border-border pt-12 pb-2 flex-shrink-0 relative drag-region">
      {/* Section nav */}
      <div className="flex flex-col items-center gap-1 px-3 no-drag">
        {NAV_KEYS.map((key) => {
          const isActive = activeSection === key
          return (
            <button
              key={key}
              onClick={() => onSelectSection(key)}
              onMouseEnter={(e) => showTooltip(t(NAV_LABEL_KEYS[key]), e)}
              onMouseLeave={() => setTooltip(null)}
              className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'text-accent bg-accent-light'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-hover'
              }`}
            >
              {isActive && (
                <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent" />
              )}
              {NAV_ICONS[key]}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-border my-4" />

      {/* Projects */}
      <div className="flex-1 flex flex-col items-center gap-2 px-3 py-1 overflow-y-auto no-drag">
        <AnimatePresence>
          {projects.map((p) => {
            const color = projectColor(p.name)
            const isActive = p.id === activeProjectId
            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => onSelectProject(p.id)}
                onMouseEnter={(e) => showTooltip(p.name, e)}
                onMouseLeave={() => setTooltip(null)}
                className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[15px] font-semibold cursor-pointer transition-all duration-150 ${isActive ? 'ring-2 ring-accent ring-offset-2 ring-offset-white' : ''}`}
                style={{
                  backgroundColor: isActive ? color + '18' : color + '10',
                  color: color,
                  boxShadow: isActive ? undefined : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                {p.name.charAt(0).toUpperCase()}
              </motion.button>
            )
          })}
        </AnimatePresence>

        {/* Add project */}
        <button
          onClick={onCreateProject}
          onMouseEnter={(e) => showTooltip(t('nav.newProject'), e)}
          onMouseLeave={() => setTooltip(null)}
          className="mt-2 w-9 h-9 rounded-[10px] flex items-center justify-center text-txt-muted hover:text-accent hover:bg-accent-light border border-dashed border-border-light hover:border-accent/30 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            className="fixed left-[78px] z-50 px-2.5 py-1.5 rounded-lg bg-txt-primary text-white text-xs font-medium shadow-lg whitespace-nowrap pointer-events-none"
            style={{ top: tooltipY, transform: 'translateY(-50%)' }}
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

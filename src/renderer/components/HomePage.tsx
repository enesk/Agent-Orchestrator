import React from 'react'
import { motion } from 'framer-motion'
import type { Project } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  projects: Project[]
  onSelectProject: (id: string) => void
  onCreateProject: () => void
}

function projectColor(name: string): string {
  const colors = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#F97316', '#A855F7', '#14B8A6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function HomePage({ projects, onSelectProject, onCreateProject }: Props) {
  const { t } = useLanguage()

  return (
    <div className="flex-1 overflow-y-auto bg-surface-dark">
      <div className="max-w-[720px] mx-auto w-full py-10 px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-txt-primary mb-1">{t('home.title')}</h1>
          <p className="text-sm text-txt-secondary">{t('home.subtitle')}</p>
        </div>

        {/* Project List */}
        {projects.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {projects.map((project, i) => {
              const color = projectColor(project.name)
              const createdDate = new Date(project.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
              const agentCount = project.agents.length

              return (
                <motion.button
                  key={project.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12, delay: i * 0.025 }}
                  onClick={() => onSelectProject(project.id)}
                  className="text-left bg-white rounded-xl border border-border px-4 py-3.5 hover:shadow-sm hover:border-accent/25 transition-all duration-150 group"
                >
                  <div className="flex items-center gap-3.5">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold flex-shrink-0"
                      style={{ backgroundColor: color + '15', color }}
                    >
                      {project.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + Description */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-txt-primary truncate group-hover:text-accent transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-xs text-txt-secondary mt-0.5 truncate">{project.description}</p>
                      )}
                    </div>

                    {/* Agents (compact) */}
                    {agentCount > 0 && (
                      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                        {project.agents.slice(0, 3).map((agent) => (
                          <span
                            key={agent.id}
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: agent.color }}
                            title={agent.name}
                          />
                        ))}
                        {agentCount > 3 && (
                          <span className="text-[10px] text-txt-muted ml-0.5">+{agentCount - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Meta */}
                    <div className="hidden sm:flex items-center gap-2 text-xs text-txt-muted flex-shrink-0">
                      <span>{agentCount} {agentCount === 1 ? t('home.agent') : t('home.agents')}</span>
                      <span className="text-border-light">·</span>
                      <span>{createdDate}</span>
                    </div>

                    {/* Arrow */}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-txt-muted/50 group-hover:text-accent transition-colors flex-shrink-0"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </motion.button>
              )
            })}

            {/* Create Project Button */}
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12, delay: projects.length * 0.025 }}
              onClick={onCreateProject}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border-light hover:border-accent/30 hover:bg-accent-light/30 transition-all duration-150 group"
            >
              <div className="w-9 h-9 rounded-lg bg-accent-muted flex items-center justify-center group-hover:bg-accent/15 transition-colors flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent" />
                </svg>
              </div>
              <span className="text-sm font-medium text-txt-secondary group-hover:text-accent transition-colors">
                {t('home.createProject')}
              </span>
            </motion.button>
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-txt-primary mb-1">{t('home.noProjects')}</h3>
            <p className="text-sm text-txt-secondary mb-5">{t('home.noProjectsDesc')}</p>
            <button
              onClick={onCreateProject}
              className="h-11 px-6 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
            >
              {t('home.createFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

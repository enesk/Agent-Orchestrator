import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useIpc } from '../hooks/useIpc'
import { useLanguage } from '../i18n/LanguageContext'
import type { GlobalAgent, ProjectAgent } from '@shared/types'

interface Props {
  projectAgents: ProjectAgent[]
  onClose: () => void
  onSelectGlobal: (globalAgentId: string) => void
  onCreateNew: () => void
}

export default function AgentPickerModal({ projectAgents, onClose, onSelectGlobal, onCreateNew }: Props) {
  const ipc = useIpc()
  const { t } = useLanguage()
  const [globalAgents, setGlobalAgents] = useState<GlobalAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    ipc.getGlobalAgents().then((agents) => {
      setGlobalAgents(agents)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Filter out agents already in the project
  const projectGlobalIds = new Set(projectAgents.map((a) => a.globalAgentId).filter(Boolean))
  const available = globalAgents.filter((a) => !projectGlobalIds.has(a.id))
  const filtered = search
    ? available.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.title ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : available

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] bg-white max-h-[80vh] flex flex-col"
        style={{ borderRadius: '20px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <h3 className="text-[22px] font-bold text-txt-primary mb-1">{t('agentPicker.title')}</h3>
          <p className="text-[15px] text-txt-secondary">{t('agentPicker.subtitle')}</p>
        </div>

        {/* Search */}
        {available.length > 3 && (
          <div className="px-8 pb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('agentPicker.searchPlaceholder')}
              className="w-full px-4 h-10 rounded-[10px] bg-surface-dark border border-border text-sm text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
              autoFocus
            />
          </div>
        )}

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto px-8 pb-4" style={{ minHeight: '120px' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-txt-muted">
                {available.length === 0 ? t('agentPicker.noAgents') : t('agentPicker.noResults')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onSelectGlobal(agent.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors text-left group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-medium flex-shrink-0"
                    style={{ backgroundColor: agent.color + '18', color: agent.color }}
                  >
                    {agent.avatar || agent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-txt-primary">{agent.name}</span>
                      <span className="text-[11px] font-mono text-txt-muted">{agent.mentionKey}</span>
                    </div>
                    {agent.title && (
                      <p className="text-xs text-txt-secondary truncate">{agent.title}</p>
                    )}
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-txt-muted group-hover:text-accent transition-colors flex-shrink-0"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-3 border-t border-border">
          <button
            onClick={onCreateNew}
            className="w-full h-11 rounded-[10px] bg-accent hover:bg-accent-dark text-white text-[15px] font-semibold transition-all flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('agentPicker.createNew')}
          </button>
          <button onClick={onClose} className="w-full mt-3 text-sm text-txt-secondary hover:text-txt-primary transition-colors text-center">
            {t('common.cancel')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

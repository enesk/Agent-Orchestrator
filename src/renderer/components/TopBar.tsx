import React from 'react'
import type { Project } from '@shared/types'
import type { SyncStatus } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  project: Project | null
  syncStatus: SyncStatus
  onDisconnect: () => void
  onTriggerSync: () => void
  onToggleContext: () => void
  contextOpen: boolean
}

export default function TopBar({ project, syncStatus, onDisconnect, onTriggerSync, onToggleContext, contextOpen }: Props) {
  const { t } = useLanguage()

  let syncDot = 'bg-gray-400'
  let syncLabel = t('common.offline')

  if (syncStatus.isOnline && syncStatus.isSyncing) {
    syncDot = 'bg-accent'
    syncLabel = t('topbar.syncing')
  } else if (syncStatus.isOnline && syncStatus.unsyncedCount > 0) {
    syncDot = 'bg-status-warning'
    syncLabel = `${syncStatus.unsyncedCount} ${t('topbar.pending')}`
  } else if (syncStatus.isOnline) {
    syncDot = 'bg-status-success'
    syncLabel = t('topbar.synced')
  }

  return (
    <div className="flex items-center h-14 px-5 border-b border-border bg-white flex-shrink-0 drag-region">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2.5 no-drag">
        <span className="text-base text-txt-secondary font-medium">Orchestrator</span>
        <span className="text-border-light">/</span>
        {project ? (
          <span className="text-base font-semibold text-txt-primary">{project.name}</span>
        ) : (
          <span className="text-base text-txt-muted">{t('topbar.noProject')}</span>
        )}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1.5 no-drag">
        {/* Sync status pill */}
        <button
          onClick={onTriggerSync}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-txt-secondary hover:bg-surface-hover transition-colors"
          title={syncLabel}
        >
          {syncStatus.isSyncing ? (
            <div className="w-4 h-4 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className={`w-2 h-2 rounded-full ${syncDot}`} />
          )}
          <span className="text-xs font-medium">{syncLabel}</span>
        </button>

        {/* Toggle context panel */}
        <button
          onClick={onToggleContext}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${contextOpen ? 'bg-accent-light text-accent' : 'text-txt-secondary hover:bg-surface-hover hover:text-txt-primary'}`}
          title={t('topbar.sidebar')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>

        {/* Disconnect */}
        <button
          onClick={onDisconnect}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-txt-secondary hover:bg-surface-hover hover:text-status-error transition-colors"
          title={t('topbar.disconnect')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

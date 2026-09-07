import React from 'react'
import type { ProjectAgent, TicketGroups } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  agents: ProjectAgent[]
  tickets: TicketGroups
  messageCount: number
  documentCount?: number
}

export default function StatusBar({ agents, tickets, messageCount, documentCount = 0 }: Props) {
  const { t } = useLanguage()
  const activeAgents = agents.filter((a) => a.status !== 'idle')
  const openTickets = tickets.open.length + tickets.in_progress.length

  return (
    <div className="flex items-center h-[32px] px-4 border-t border-border bg-white text-[13px] text-txt-muted flex-shrink-0 gap-4">
      {/* Agents */}
      <span className="flex items-center gap-1.5">
        {activeAgents.length > 0 ? (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
            {activeAgents.length} {activeAgents.length !== 1 ? t('statusbar.agents') : t('statusbar.agent')} {t('statusbar.active')}
          </>
        ) : (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            {agents.length} {agents.length !== 1 ? t('statusbar.agents') : t('statusbar.agent')}
          </>
        )}
      </span>

      <span className="text-txt-muted/30">·</span>

      {/* Tickets */}
      <span>{openTickets} {openTickets !== 1 ? t('statusbar.tickets') : t('statusbar.ticket')} {t('statusbar.openTickets')}</span>

      <span className="text-txt-muted/30">·</span>

      {/* Documents */}
      {documentCount > 0 && (
        <>
          <span>{documentCount} {t('documents.title')}</span>
          <span className="text-txt-muted/30">·</span>
        </>
      )}

      {/* Messages */}
      <span>{messageCount} {t('statusbar.messages')}</span>
    </div>
  )
}

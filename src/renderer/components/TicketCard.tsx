import React from 'react'
import { motion } from 'framer-motion'
import type { Ticket, ProjectAgent, TicketCategory } from '@shared/types'
import { TICKET_CATEGORIES } from '@shared/types'
import { htmlToPlainText } from './RichTextEditor'

interface Props {
  ticket: Ticket
  agents: ProjectAgent[]
  onClick: () => void
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  bug: { bg: '#FEF2F2', text: '#DC2626' },
  feature: { bg: '#EEF2FF', text: '#4F46E5' },
  task: { bg: '#F4F5F7', text: '#374151' },
  improvement: { bg: '#ECFDF5', text: '#059669' },
  documentation: { bg: '#EFF6FF', text: '#3B82F6' },
  question: { bg: '#FEF3C7', text: '#B45309' },
  epic: { bg: '#EEF2FF', text: '#6366F1' },
}

export default function TicketCard({ ticket, agents, onClick }: Props) {
  const assignedAgent = ticket.assignedAgentLocalId
    ? agents.find((a) => a.id === ticket.assignedAgentLocalId)
    : null

  const cat = ticket.category
    ? TICKET_CATEGORIES.find((c) => c.value === ticket.category)
    : null
  const catColors = ticket.category ? CATEGORY_COLORS[ticket.category] : null
  const descPreview = ticket.description ? htmlToPlainText(ticket.description) : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group p-4 rounded-xl bg-white border border-border cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      whileHover={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
    >
      {/* Title */}
      <p className="text-base font-semibold text-txt-primary line-clamp-2">
        <span className="text-txt-muted font-mono text-[11px] mr-1">#{ticket.ticketNumber}</span>
        {ticket.title}
      </p>

      {/* Description */}
      {descPreview && (
        <p className="text-sm text-txt-secondary line-clamp-2 mt-1">{descPreview}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          {/* Category pill */}
          {cat && catColors && (
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: catColors.bg, color: catColors.text }}
            >
              {cat.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Agent avatar mini */}
          {assignedAgent && (
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-medium"
              style={{ backgroundColor: assignedAgent.color + '18', color: assignedAgent.color }}
            >
              {assignedAgent.avatar || assignedAgent.name.charAt(0)}
            </div>
          )}

          {/* Attachment count */}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <div className="flex items-center gap-0.5 text-txt-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="text-xs">{ticket.attachments.length}</span>
            </div>
          )}

          {/* Comment count */}
          {ticket.comments.length > 0 && (
            <div className="flex items-center gap-0.5 text-txt-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span className="text-xs">{ticket.comments.length}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

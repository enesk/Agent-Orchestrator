import React, { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Ticket, TicketGroups, TicketStatus, TicketCategory, ProjectAgent, MessageAttachment } from '@shared/types'
import { TICKET_CATEGORIES } from '@shared/types'
import type { ImportResult } from '@shared/ticketImport'
import TicketCreateModal from './TicketCreateModal'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { htmlToPlainText } from './RichTextEditor'

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  bug: 'category.bug',
  feature: 'category.feature',
  task: 'category.task',
  improvement: 'category.improvement',
  documentation: 'category.documentation',
  question: 'category.question',
  epic: 'category.epic',
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  bug: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  feature: { bg: '#F5F3FF', text: '#7C3AED', dot: '#8B5CF6' },
  task: { bg: '#EFF6FF', text: '#2563EB', dot: '#60A5FA' },
  improvement: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  documentation: { bg: '#ECFEFF', text: '#0891B2', dot: '#06B6D4' },
  question: { bg: '#FDF2F8', text: '#DB2777', dot: '#EC4899' },
  epic: { bg: '#EEF2FF', text: '#4F46E5', dot: '#6366F1' },
}

interface Props {
  tickets: TicketGroups
  agents: ProjectAgent[]
  projectName: string
  onCreateTicket: (title: string, description?: string, assignedAgentLocalId?: string, assignedAgentName?: string, category?: TicketCategory, attachments?: MessageAttachment[]) => Promise<Ticket | undefined>
  onSelectTicket: (ticket: Ticket) => void
  onStartWork?: (ticket: Ticket) => void
  onUpdateTicket?: (ticketId: string, updates: Partial<Ticket>) => Promise<Ticket | undefined>
  onDeleteTickets?: (ticketIds: string[]) => Promise<void>
  onImportTickets?: (content?: string) => Promise<ImportResult | undefined>
  onStartVorhaben?: (ticketIds: string[]) => Promise<void>
}

interface ColumnDef {
  key: TicketStatus
  labelKey: TranslationKey
  color: string
  icon: React.ReactNode
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'open',
    labelKey: 'tickets.open',
    color: '#3B82F6',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    key: 'in_progress',
    labelKey: 'tickets.inProgress',
    color: '#F59E0B',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  {
    key: 'done',
    labelKey: 'tickets.done',
    color: '#10B981',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
]

export default function TicketBoard({ tickets, agents, projectName, onCreateTicket, onSelectTicket, onStartWork, onUpdateTicket, onDeleteTickets, onImportTickets, onStartVorhaben }: Props) {
  const { t } = useLanguage()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [draggedTicket, setDraggedTicket] = useState<Ticket | null>(null)
  const [dropTarget, setDropTarget] = useState<TicketStatus | null>(null)
  const [filterCategory, setFilterCategory] = useState<TicketCategory | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [fileDropActive, setFileDropActive] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showWarnings, setShowWarnings] = useState(false)

  const totalCount = tickets.open.length + tickets.in_progress.length + tickets.done.length
  const allTickets = [...tickets.open, ...tickets.in_progress, ...tickets.done]

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(allTickets.map((t) => t.id)))
  }

  const [startingVorhaben, setStartingVorhaben] = useState(false)

  const handleBulkDelete = async () => {
    if (!onDeleteTickets || selectedIds.size === 0) return
    await onDeleteTickets(Array.from(selectedIds))
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  const handleStartVorhaben = async () => {
    if (!onStartVorhaben || selectedIds.size === 0 || startingVorhaben) return
    setStartingVorhaben(true)
    try {
      await onStartVorhaben(Array.from(selectedIds))
      setSelectedIds(new Set())
      setSelectMode(false)
    } finally {
      setStartingVorhaben(false)
    }
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const filterTickets = (list: Ticket[]) => {
    let filtered = list
    if (filterCategory) {
      filtered = filtered.filter((t) => t.category === filterCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        htmlToPlainText(t.description ?? '').toLowerCase().includes(q) ||
        `#${t.ticketNumber}`.includes(q)
      )
    }
    return filtered
  }

  const handleDragStart = (ticket: Ticket) => setDraggedTicket(ticket)

  const handleDragEnd = () => {
    if (draggedTicket && dropTarget && dropTarget !== draggedTicket.status && onUpdateTicket) {
      onUpdateTicket(draggedTicket.id, { status: dropTarget })
    }
    setDraggedTicket(null)
    setDropTarget(null)
  }

  // ── JSON-Import (Button + Drag&Drop) ──────────────────────────────────────

  const runImport = async (content?: string) => {
    if (!onImportTickets || importing) return
    setImporting(true)
    try {
      const result = await onImportTickets(content)
      if (result && !result.canceled) {
        setImportResult(result)
        setShowWarnings(false)
      }
    } catch {
      setImportResult({ success: false, errors: ['Unerwarteter Fehler beim Import'] })
    } finally {
      setImporting(false)
    }
  }

  // Erfolgs-Toast ohne Warnungen automatisch ausblenden
  useEffect(() => {
    if (importResult?.success && (importResult.warnings?.length ?? 0) === 0) {
      const timer = setTimeout(() => setImportResult(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [importResult])

  const handleFileDragOver = (e: React.DragEvent) => {
    if (!onImportTickets || !Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!fileDropActive) setFileDropActive(true)
  }

  const handleFileDragLeave = (e: React.DragEvent) => {
    if (rootRef.current && !rootRef.current.contains(e.relatedTarget as Node)) {
      setFileDropActive(false)
    }
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    if (!onImportTickets || e.dataTransfer.files.length === 0) return
    e.preventDefault()
    setFileDropActive(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.json'))
    if (!file) {
      setImportResult({ success: false, errors: ['Nur .json-Dateien werden unterstützt'] })
      return
    }
    const content = await file.text()
    runImport(content)
  }

  return (
    <div
      ref={rootRef}
      className="relative flex flex-col h-full flex-1 min-w-0 bg-surface-dark"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {/* Header bar */}
      <div className="px-5 pt-4 pb-3 border-b border-border bg-surface-dark">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-txt-primary">{t('nav.tickets')}</h2>
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-txt-muted bg-surface-light">
              {totalCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={selectAll}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg text-txt-secondary hover:bg-surface-hover transition-colors"
                >
                  {selectedIds.size === allTickets.length ? t('goal.deselectAll') : t('goal.selectAll')}
                </button>
                {onStartVorhaben && (
                  <button
                    onClick={handleStartVorhaben}
                    disabled={selectedIds.size === 0 || startingVorhaben}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 text-white hover:from-violet-600 hover:to-cyan-600 disabled:opacity-30 transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    {startingVorhaben
                      ? '…'
                      : selectedIds.size > 0
                        ? `${selectedIds.size} ${t('tickets.startVorhaben')}`
                        : t('tickets.startVorhaben')}
                  </button>
                )}
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-status-error text-white hover:bg-red-600 disabled:opacity-30 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  {selectedIds.size > 0 ? `${selectedIds.size} ${t('tickets.delete')}` : t('tickets.delete')}
                </button>
                <button
                  onClick={exitSelectMode}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                {onDeleteTickets && totalCount > 0 && (
                  <button
                    onClick={() => setSelectMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                    {t('tickets.select')}
                  </button>
                )}
                {onImportTickets && (
                  <button
                    onClick={() => runImport()}
                    disabled={importing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-txt-secondary border border-border hover:bg-surface-hover disabled:opacity-50 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {importing ? '…' : t('tickets.import')}
                  </button>
                )}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {t('tickets.createTicket')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-[240px]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen..."
              className="w-full h-7 pl-8 pr-3 rounded-md bg-surface border border-border text-xs text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[2px] focus:ring-accent/10 outline-none transition-all"
            />
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-1">
            {TICKET_CATEGORIES.map((cat) => {
              const colors = CATEGORY_COLORS[cat.value]
              const isActive = filterCategory === cat.value
              return (
                <button
                  key={cat.value}
                  onClick={() => setFilterCategory(isActive ? '' : cat.value)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    isActive ? 'ring-1 ring-current' : 'opacity-50 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                  }}
                >
                  {t(CATEGORY_LABEL_KEYS[cat.value])}
                </button>
              )
            })}
            {filterCategory && (
              <button
                onClick={() => setFilterCategory('')}
                className="ml-1 text-[11px] text-txt-muted hover:text-txt-primary transition-colors"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full min-w-0">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              col={col}
              tickets={filterTickets(tickets[col.key])}
              agents={agents}
              draggedTicket={draggedTicket}
              dropTarget={dropTarget}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onSetDropTarget={setDropTarget}
              onSelectTicket={onSelectTicket}
              onStartWork={onStartWork}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      </div>

      {/* JSON file drop overlay */}
      {fileDropActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-accent/5 border-2 border-dashed border-accent rounded-lg pointer-events-none">
          <div className="px-4 py-2 rounded-lg bg-white shadow-md text-sm font-medium text-accent">
            {t('tickets.importDrop')}
          </div>
        </div>
      )}

      {/* Import result toast */}
      <AnimatePresence>
        {importResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[90%] rounded-xl bg-white border border-border shadow-lg overflow-hidden"
          >
            <div className="flex items-start gap-2.5 px-4 py-3">
              <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                importResult.success
                  ? (importResult.warnings?.length ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')
                  : 'bg-red-100 text-red-600'
              }`}>
                {importResult.success ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {importResult.success ? (
                  <>
                    <p className="text-[13px] font-medium text-txt-primary">
                      {importResult.imported ?? 0} importiert, {importResult.updated ?? 0} aktualisiert, {importResult.warnings?.length ?? 0} Warnungen
                    </p>
                    {(importResult.warnings?.length ?? 0) > 0 && (
                      <button
                        onClick={() => setShowWarnings((v) => !v)}
                        className="mt-1 text-[11px] font-medium text-amber-600 hover:text-amber-700 transition-colors"
                      >
                        {t('tickets.importWarnings')} {showWarnings ? '▾' : '▸'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-medium text-txt-primary">{t('tickets.importFailed')}</p>
                    <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                      {importResult.errors?.map((err, i) => (
                        <li key={i} className="text-[11px] text-red-600 leading-relaxed">{err}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <button
                onClick={() => setImportResult(null)}
                className="text-txt-muted hover:text-txt-primary transition-colors flex-shrink-0"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {showWarnings && importResult.success && (
              <ul className="px-4 pb-3 space-y-1 max-h-44 overflow-y-auto border-t border-border pt-2">
                {importResult.warnings?.map((w, i) => (
                  <li key={i} className="text-[11px] text-txt-secondary leading-relaxed">
                    {w.ticketId && <span className="font-mono text-txt-muted">[{w.ticketId}]</span>} {w.message}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showCreateModal && (
          <TicketCreateModal
            agents={agents}
            onClose={() => setShowCreateModal(false)}
            onCreate={async (title, desc, agentId, agentName, category, attachments) => {
              await onCreateTicket(title, desc, agentId, agentName, category, attachments)
              setShowCreateModal(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Column component ────────────────────────────────────────────────────────

function KanbanColumn({ col, tickets: columnTickets, agents, draggedTicket, dropTarget, onDragStart, onDragEnd, onSetDropTarget, onSelectTicket, onStartWork, selectMode, selectedIds, onToggleSelect }: {
  col: ColumnDef
  tickets: Ticket[]
  agents: ProjectAgent[]
  draggedTicket: Ticket | null
  dropTarget: TicketStatus | null
  onDragStart: (t: Ticket) => void
  onDragEnd: () => void
  onSetDropTarget: (s: TicketStatus | null) => void
  onSelectTicket: (t: Ticket) => void
  onStartWork?: (t: Ticket) => void
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const colRef = useRef<HTMLDivElement>(null)
  const isDropTarget = dropTarget === col.key && draggedTicket?.status !== col.key

  const handleDragOver = (e: React.DragEvent) => {
    // Datei-Drags (JSON-Import) zum Board-Root durchreichen
    if (Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTarget !== col.key) onSetDropTarget(col.key)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (colRef.current && !colRef.current.contains(e.relatedTarget as Node)) {
      onSetDropTarget(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onDragEnd()
  }

  return (
    <div
      ref={colRef}
      className="flex-1 min-w-[240px] max-w-[380px] flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-2.5 px-1">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ backgroundColor: col.color + '15', color: col.color }}
        >
          {col.icon}
        </div>
        <span className="text-sm font-semibold text-txt-primary">{t(col.labelKey)}</span>
        <span
          className="px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums"
          style={{ backgroundColor: col.color + '12', color: col.color }}
        >
          {columnTickets.length}
        </span>
      </div>

      {/* Cards container */}
      <div
        className={`flex-1 overflow-y-auto rounded-xl transition-colors duration-150 ${
          isDropTarget
            ? 'bg-surface-light/80'
            : ''
        }`}
        style={{
          ...(isDropTarget ? { outline: `2px dashed ${col.color}40` } : {}),
        }}
      >
        <div className="space-y-2 pb-2">
          {columnTickets.length === 0 && (
            <div className={`flex items-center justify-center h-14 rounded-lg border border-dashed transition-colors ${
              isDropTarget ? '' : 'border-border'
            }`}
              style={isDropTarget ? { borderColor: col.color + '40', backgroundColor: col.color + '06' } : {}}
            >
              <p className="text-[11px] text-txt-muted">
                {isDropTarget ? 'Hierher ziehen' : t('tickets.noTickets')}
              </p>
            </div>
          )}
          <AnimatePresence>
            {columnTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                agents={agents}
                isDragging={draggedTicket?.id === ticket.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={selectMode ? () => onToggleSelect(ticket.id) : () => onSelectTicket(ticket)}
                onStartWork={onStartWork}
                selectMode={selectMode}
                isSelected={selectedIds.has(ticket.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Card component ──────────────────────────────────────────────────────────

function TicketCard({ ticket, agents, isDragging, onDragStart, onDragEnd, onClick, onStartWork, selectMode, isSelected }: {
  ticket: Ticket
  agents: ProjectAgent[]
  isDragging: boolean
  onDragStart: (t: Ticket) => void
  onDragEnd: () => void
  onClick: () => void
  onStartWork?: (t: Ticket) => void
  selectMode?: boolean
  isSelected?: boolean
}) {
  const { t } = useLanguage()
  const assignedAgent = ticket.assignedAgentLocalId
    ? agents.find((a) => a.id === ticket.assignedAgentLocalId)
    : null
  const catColors = ticket.category ? CATEGORY_COLORS[ticket.category] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      draggable={!selectMode}
      onDragStart={() => !selectMode && onDragStart(ticket)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group px-3 py-2.5 rounded-lg bg-white border transition-all duration-100 ${
        selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-border/80 hover:border-border-strong hover:shadow-sm'
      }`}
    >
      {/* Top: checkbox/number + category */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {selectMode && (
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              isSelected ? 'bg-accent border-accent' : 'border-border-light'
            }`}>
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          )}
          <span className="text-[11px] font-mono text-txt-muted">#{ticket.ticketNumber}</span>
        </div>
        {ticket.category && catColors && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ backgroundColor: catColors.bg, color: catColors.text }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColors.dot }} />
            {t(CATEGORY_LABEL_KEYS[ticket.category])}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-[13px] text-txt-primary font-medium leading-snug line-clamp-2">
        {ticket.title}
      </p>

      {/* Description preview */}
      {(() => {
        const preview = htmlToPlainText(ticket.description ?? '')
        return preview ? (
          <p className="text-[11px] text-txt-muted leading-relaxed line-clamp-1 mt-0.5">{preview}</p>
        ) : null
      })()}

      {/* Bottom: agent + comments */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {assignedAgent ? (
            <div className="flex items-center gap-1">
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: assignedAgent.color + '18', color: assignedAgent.color }}
              >
                {assignedAgent.avatar || assignedAgent.name.charAt(0)}
              </div>
              <span className="text-[11px] text-txt-muted font-medium">{assignedAgent.name}</span>
            </div>
          ) : (
            <span className="text-[10px] text-txt-muted/50">—</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* "Los" — start work via the assigned agent */}
          {!selectMode && onStartWork && ticket.status !== 'done' && (
            <button
              type="button"
              disabled={!assignedAgent}
              title={assignedAgent ? t('tickets.startTooltip') : t('tickets.startNoAgent')}
              onClick={(e) => {
                e.stopPropagation()
                if (assignedAgent) onStartWork(ticket)
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                assignedAgent
                  ? 'bg-accent text-white hover:bg-accent-dark'
                  : 'bg-surface-light text-txt-muted/60 cursor-not-allowed'
              }`}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {t('tickets.start')}
            </button>
          )}

          {/* Attachment count */}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <div className="flex items-center gap-0.5 text-txt-muted">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="text-[10px] font-medium">{ticket.attachments.length}</span>
            </div>
          )}

          {/* Comment count */}
          {ticket.comments.length > 0 && (
            <div className="flex items-center gap-0.5 text-txt-muted">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span className="text-[10px] font-medium">{ticket.comments.length}</span>
            </div>
          )}

          {/* Goal indicator — pulses while the ticket is actively being worked by a Vorhaben */}
          {ticket.goalId && (
            ticket.status === 'in_progress' ? (
              <div className="flex items-center gap-1 text-violet-500 animate-pulse" title="Wird gerade bearbeitet">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span className="text-[9px] font-semibold uppercase tracking-wide">{t('tickets.working')}</span>
              </div>
            ) : (
              <div className="flex items-center text-violet-400" title="Vorhaben">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
            )
          )}
        </div>
      </div>
    </motion.div>
  )
}

import React, { useState, useRef, useEffect, useCallback, PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ProjectDocument } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'
import { useIpc } from '../hooks/useIpc'

interface Props {
  documents: ProjectDocument[]
  onCreateDocument: (title: string, content: string) => Promise<ProjectDocument | undefined>
  onUpdateDocument: (id: string, updates: { title?: string; content?: string }) => Promise<ProjectDocument | undefined>
  onDeleteDocument: (id: string) => Promise<void>
}

const SIDEBAR_STORAGE_KEY = 'orchestrator-doc-sidebar-width'
const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 400
const SIDEBAR_DEFAULT = 280

function getStoredSidebarWidth(): number {
  try {
    const v = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (v) { const n = parseInt(v, 10); if (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n }
  } catch {}
  return SIDEBAR_DEFAULT
}

export default function DocumentsView({ documents, onCreateDocument, onUpdateDocument, onDeleteDocument }: Props) {
  const { t } = useLanguage()
  const ipc = useIpc()
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')
  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth)
  const [isResizing, setIsResizing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changeCountRef = useRef(0)
  const savedCountRef = useRef(0)
  const newTitleRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? null

  // Sync editor when selection changes
  useEffect(() => {
    if (selectedDoc) {
      setEditTitle(selectedDoc.title)
      setEditContent(selectedDoc.content)
      setConfirmDelete(false)
      setViewMode('preview')
      setSaved(false)
      changeCountRef.current += 1
    }
  }, [selectedDocId])

  // Sync when doc is updated externally
  useEffect(() => {
    if (selectedDoc) {
      setEditTitle(selectedDoc.title)
      setEditContent(selectedDoc.content)
      changeCountRef.current += 1
    }
  }, [selectedDoc?.updatedAt])

  // Autosave with debounce — skip programmatic changes
  useEffect(() => {
    if (!selectedDocId) return
    if (changeCountRef.current !== savedCountRef.current) {
      savedCountRef.current = changeCountRef.current
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!editTitle.trim()) return
      setSaving(true)
      try {
        await onUpdateDocument(selectedDocId, { title: editTitle.trim(), content: editContent })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } finally {
        setSaving(false)
      }
    }, 1000)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [editTitle, editContent])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    const doc = await onCreateDocument(newTitle.trim(), '')
    if (doc) {
      setSelectedDocId(doc.id)
      setCreating(false)
      setNewTitle('')
      setTimeout(() => editorRef.current?.focus(), 100)
    }
  }

  const handleDelete = async () => {
    if (!selectedDocId) return
    await onDeleteDocument(selectedDocId)
    setSelectedDocId(null)
    setConfirmDelete(false)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const formatDateFull = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // Sidebar resize
  const handleSidebarResize = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = ev.clientX - startX
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + delta)))
    }

    const onUp = (ev: globalThis.PointerEvent) => {
      const finalWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + (ev.clientX - startX)))
      setIsResizing(false)
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(finalWidth)) } catch {}
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [sidebarWidth])

  // Download document as .md file
  const handleDownloadMd = useCallback(() => {
    if (!selectedDoc) return
    const blob = new Blob([editContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editTitle.trim() || 'document'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [selectedDoc, editContent, editTitle])

  // Convert markdown to HTML string using ReactMarkdown + temporary DOM
  const markdownToHtml = useCallback((md: string): string => {
    const container = document.createElement('div')
    const root = createRoot(container)
    flushSync(() => {
      root.render(
        React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md)
      )
    })
    const html = container.innerHTML
    root.unmount()
    return html
  }, [])

  // Download document as PDF
  const [exporting, setExporting] = useState(false)
  const handleDownloadPdf = useCallback(async () => {
    if (!selectedDoc || exporting) return
    setExporting(true)
    try {
      const htmlContent = markdownToHtml(editContent)
      await ipc.exportPdf(editTitle.trim() || 'Document', htmlContent)
    } finally {
      setExporting(false)
    }
  }, [selectedDoc, editContent, editTitle, exporting, ipc, markdownToHtml])

  // Word / line count
  const wordCount = editContent.trim() ? editContent.trim().split(/\s+/).length : 0
  const lineCount = editContent ? editContent.split('\n').length : 0

  return (
    <div className="w-full h-full flex overflow-hidden">
      {/* ── Sidebar: Document List ──────────────────────────────── */}
      <div
        className="flex flex-col h-full border-r border-border bg-white flex-shrink-0 relative"
        style={{ width: sidebarWidth }}
      >
        {/* Sidebar header */}
        <div className="px-4 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-txt-primary">{t('documents.title')}</h2>
            <button
              onClick={() => { setCreating(true); setTimeout(() => newTitleRef.current?.focus(), 50) }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-accent hover:bg-accent-light transition-colors"
              title={t('documents.create')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-txt-muted leading-tight">{t('documents.subtitle')}</p>
        </div>

        {/* Create inline */}
        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden px-3 pb-2"
            >
              <div className="rounded-xl border border-accent/30 p-2.5 space-y-2 bg-accent/[0.03]">
                <input
                  ref={newTitleRef}
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewTitle('') } }}
                  placeholder={t('documents.titlePlaceholder')}
                  className="w-full px-3 h-9 rounded-lg bg-white border border-border text-sm text-txt-primary placeholder:text-txt-muted focus:border-accent outline-none transition-all"
                />
                <div className="flex gap-1.5 justify-end">
                  <button onClick={() => { setCreating(false); setNewTitle('') }} className="px-2.5 h-7 rounded-lg text-xs text-txt-secondary hover:bg-surface-hover transition-colors">
                    {t('common.cancel')}
                  </button>
                  <button onClick={handleCreate} disabled={!newTitle.trim()} className="px-2.5 h-7 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-dark disabled:opacity-30 transition-all">
                    {t('common.create')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {documents.length === 0 && !creating ? (
            <div className="text-center py-12 px-4">
              <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="text-xs text-txt-muted mb-1">{t('documents.noDocuments')}</p>
              <p className="text-[11px] text-txt-muted/70 leading-relaxed">{t('documents.noDocumentsDesc')}</p>
            </div>
          ) : (
            documents.map((doc) => {
              const isActive = doc.id === selectedDocId
              const author = doc.updatedByAgentName || doc.createdByAgentName || 'User'

              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 mb-0.5 transition-all ${
                    isActive
                      ? 'bg-accent/[0.08] border border-accent/20'
                      : 'hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                      className={isActive ? 'text-accent flex-shrink-0' : 'text-txt-muted flex-shrink-0'}
                    >
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className={`text-[13px] font-medium truncate ${isActive ? 'text-accent' : 'text-txt-primary'}`}>
                      {doc.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-[22px]">
                    <span className="text-[11px] text-txt-muted truncate">{author}</span>
                    <span className="text-[11px] text-txt-muted/60">{formatDate(doc.updatedAt)}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Sidebar resize handle */}
        <div
          onPointerDown={handleSidebarResize}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-accent/30 active:bg-accent/50 transition-colors"
        />
      </div>

      {/* ── Main: Editor / Preview ──────────────────────────────── */}
      {selectedDoc ? (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-surface-dark">
          {/* Editor toolbar */}
          <div className="flex items-center gap-3 px-6 h-12 border-b border-border bg-white flex-shrink-0">
            {/* View mode toggle */}
            <div className="flex items-center bg-surface-dark rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'edit' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'
                }`}
              >
                Editor
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'preview' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'
                }`}
              >
                Preview
              </button>
            </div>

            <div className="flex-1" />

            {/* Save status */}
            {saving && (
              <span className="text-xs text-txt-muted flex items-center gap-1.5">
                <div className="w-3 h-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
                {t('projectSettings.saving')}
              </span>
            )}
            {saved && !saving && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-status-success flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('projectSettings.saved')}
              </motion.span>
            )}

            {/* Author info */}
            {(selectedDoc.updatedByAgentName || selectedDoc.createdByAgentName) && (
              <span className="text-[11px] text-txt-muted">
                {selectedDoc.updatedByAgentName
                  ? `${t('documents.updatedBy')} ${selectedDoc.updatedByAgentName}`
                  : `${t('documents.createdBy')} ${selectedDoc.createdByAgentName}`
                }
              </span>
            )}

            {/* Download MD */}
            <button
              onClick={handleDownloadMd}
              className="h-7 px-2 rounded-lg flex items-center gap-1.5 text-txt-muted hover:text-accent hover:bg-accent-light transition-colors"
              title={t('documents.download')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="text-[11px] font-medium">.md</span>
            </button>

            {/* Download PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={exporting}
              className="h-7 px-2 rounded-lg flex items-center gap-1.5 text-txt-muted hover:text-accent hover:bg-accent-light transition-colors disabled:opacity-40"
              title={t('documents.downloadPdf')}
            >
              {exporting ? (
                <div className="w-3 h-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span className="text-[11px] font-medium">.pdf</span>
            </button>

            {/* Delete */}
            {confirmDelete ? (
              <div className="flex gap-1.5">
                <button onClick={handleDelete} className="px-2.5 h-7 rounded-lg bg-status-error text-white text-xs font-medium hover:bg-status-error/90 transition-colors">
                  {t('projectSettings.confirmDelete')}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-2.5 h-7 rounded-lg text-xs text-txt-secondary hover:bg-surface-hover transition-colors">
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>

          {/* Title */}
          <div className="px-6 pt-5 pb-2 bg-white border-b border-border/50 flex-shrink-0">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t('documents.titlePlaceholder')}
              className="w-full text-2xl font-bold text-txt-primary bg-transparent border-none outline-none placeholder:text-txt-muted/50"
            />
            <div className="flex items-center gap-4 mt-1.5 text-[11px] text-txt-muted">
              <span>{formatDateFull(selectedDoc.updatedAt)}</span>
              <span>{wordCount} Wörter</span>
              <span>{lineCount} Zeilen</span>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {viewMode === 'edit' ? (
              <textarea
                ref={editorRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder={t('documents.contentPlaceholder')}
                className="w-full h-full px-6 py-5 text-[15px] text-txt-primary bg-white border-none outline-none resize-none leading-[1.8] placeholder:text-txt-muted/40 font-[system-ui]"
                style={{ minHeight: '100%' }}
              />
            ) : (
              <div className="px-6 py-5 bg-white min-h-full">
                {editContent.trim() ? (
                  <div className="document-markdown markdown-body max-w-[800px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-txt-muted/50 text-[15px] italic">{t('documents.contentPlaceholder')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Empty state when no doc selected ──────────────────── */
        <div className="flex-1 flex items-center justify-center bg-surface-dark">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-border flex items-center justify-center mx-auto mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-txt-muted" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <p className="text-sm text-txt-secondary mb-1">
              {documents.length > 0
                ? t('documents.title')
                : t('documents.noDocuments')
              }
            </p>
            <p className="text-xs text-txt-muted mb-4">{t('documents.noDocumentsDesc')}</p>
            {documents.length === 0 && (
              <button
                onClick={() => { setCreating(true); setTimeout(() => newTitleRef.current?.focus(), 50) }}
                className="text-sm text-accent hover:text-accent-dark transition-colors"
              >
                {t('documents.create')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

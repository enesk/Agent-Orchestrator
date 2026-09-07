import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../i18n/LanguageContext'
import { useIpc } from '../hooks/useIpc'
import GoalProgressView from './GoalProgressView'
import RichTextEditor from './RichTextEditor'
import type { GlobalAgent } from '@shared/types'

interface Props {
  projectId: string
}

type SubView = 'list' | 'create'

export default function GoalsView({ projectId }: Props) {
  const { t } = useLanguage()
  const ipc = useIpc()
  const [subView, setSubView] = useState<SubView>('list')

  // ── Create form state ──
  const [description, setDescription] = useState('')
  const [allAgents, setAllAgents] = useState<GlobalAgent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; content: string }[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load agents when switching to create
  useEffect(() => {
    if (subView !== 'create') return
    ipc.getGlobalAgents().then((agents) => {
      const workers = agents.filter((a) => a.name !== 'Matthias')
      setAllAgents(workers)
      setSelectedIds(new Set(workers.map((a) => a.id)))
    }).catch(() => {})
  }, [subView])

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const processFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.md') && !file.name.endsWith('.txt') && !file.name.endsWith('.markdown')) continue
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        if (content) {
          setUploadedFiles((prev) => [...prev, { name: file.name, content }])
        }
      }
      reader.readAsText(file)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [processFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }, [processFiles])

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const getPlainTextLength = (html: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return (tmp.textContent || '').trim().length
  }

  const handleSubmit = async () => {
    // Combine description with uploaded file contents
    let fullDescription = description
    if (uploadedFiles.length > 0) {
      const attachments = uploadedFiles.map((f) => `<hr><p><strong>${f.name}</strong></p><pre>${f.content}</pre>`).join('')
      fullDescription += attachments
    }
    if (getPlainTextLength(fullDescription) < 10) return

    await ipc.goals.start(projectId, fullDescription, Array.from(selectedIds))
    // Reset and go back to list
    setDescription('')
    setUploadedFiles([])
    setSubView('list')
  }

  const handleBack = () => {
    setDescription('')
    setUploadedFiles([])
    setSubView('list')
  }

  return (
    <div className="max-w-[780px] mx-auto w-full">
      <AnimatePresence mode="wait" initial={false}>
        {subView === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-txt-primary">{t('goal.viewTitle')}</h2>
                <p className="text-sm text-txt-muted mt-0.5">{t('goal.viewSubtitle')}</p>
              </div>
              <button
                onClick={() => setSubView('create')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white hover:from-violet-600 hover:to-cyan-600 transition-all shadow-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {t('goal.startButton')}
              </button>
            </div>
            <GoalProgressView projectId={projectId} />
          </motion.div>
        ) : (
          <motion.div
            key="create"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {/* Back + Title */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={handleBack}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-txt-primary">{t('goal.modalTitle')}</h2>
                  <p className="text-xs text-txt-muted">{t('goal.modalSubtitle')}</p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wider mb-2">
                  {t('common.description')}
                </label>
                <RichTextEditor
                  content={description}
                  onChange={setDescription}
                  placeholder={t('goal.placeholder')}
                  className="rounded-xl bg-surface border border-border overflow-hidden focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/10 transition-all"
                  minHeight="200px"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wider mb-2">
                  {t('goal.attachments')}
                </label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-accent bg-accent/5'
                      : 'border-border-light hover:border-accent/40 hover:bg-surface-hover/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,.markdown"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-txt-muted mb-2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-sm text-txt-secondary">{t('goal.dropFiles')}</p>
                  <p className="text-xs text-txt-muted mt-1">.md, .txt, .markdown</p>
                </div>

                {/* Uploaded files */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {uploadedFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-txt-muted flex-shrink-0">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-txt-primary font-medium truncate block">{file.name}</span>
                          <span className="text-[11px] text-txt-muted">{(file.content.length / 1024).toFixed(1)} KB</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agent selection */}
              {allAgents.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-txt-muted uppercase tracking-wider">{t('goal.selectAgents')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedIds.size === allAgents.length) setSelectedIds(new Set())
                        else setSelectedIds(new Set(allAgents.map((a) => a.id)))
                      }}
                      className="text-[11px] text-accent hover:text-accent-dark transition-colors"
                    >
                      {selectedIds.size === allAgents.length ? t('goal.deselectAll') : t('goal.selectAll')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allAgents.map((agent) => {
                      const isSelected = selectedIds.has(agent.id)
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => toggleAgent(agent.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-transparent shadow-sm'
                              : 'border-border opacity-40 hover:opacity-70'
                          }`}
                          style={isSelected ? { backgroundColor: agent.color + '12', borderColor: agent.color + '40' } : {}}
                        >
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                            style={{ backgroundColor: agent.color + '20', color: agent.color }}
                          >
                            {agent.avatar || agent.name.charAt(0)}
                          </div>
                          <div className="text-left">
                            <div className="text-xs font-semibold text-txt-primary">{agent.name}</div>
                            {agent.title && <div className="text-[10px] text-txt-muted leading-tight">{agent.title}</div>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pipeline preview */}
              <div className="px-4 py-3 rounded-xl bg-surface border border-border">
                <div className="flex items-center gap-2 text-xs text-txt-muted font-medium mb-2 uppercase tracking-wider">Pipeline</div>
                <div className="flex items-center gap-2">
                  {['Pflichtenheft', 'Tickets', 'Bearbeitung', 'Review'].map((step, i) => (
                    <React.Fragment key={step}>
                      {i > 0 && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-txt-muted flex-shrink-0">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                      <span className="text-xs text-txt-secondary font-medium whitespace-nowrap">{step}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={(getPlainTextLength(description) < 10 && uploadedFiles.length === 0) || selectedIds.size === 0}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white text-[15px] font-semibold disabled:opacity-20 transition-all flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {t('goal.startAutonomous')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { ProjectAgent, TicketCategory, MessageAttachment } from '@shared/types'
import { TICKET_CATEGORIES } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import RichTextEditor, { htmlToPlainText } from './RichTextEditor'
import { useIpc } from '../hooks/useIpc'

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  bug: 'category.bug',
  feature: 'category.feature',
  task: 'category.task',
  improvement: 'category.improvement',
  documentation: 'category.documentation',
  question: 'category.question',
  epic: 'category.epic',
}

const MAX_IMAGES = 8
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']

interface PendingImage {
  id: string
  file: File
  previewUrl: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface Props {
  agents: ProjectAgent[]
  onClose: () => void
  onCreate: (title: string, description?: string, assignedAgentLocalId?: string, assignedAgentName?: string, category?: TicketCategory, attachments?: MessageAttachment[]) => void
}

export default function TicketCreateModal({ agents, onClose, onCreate }: Props) {
  const { t } = useLanguage()
  const ipc = useIpc()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedAgentId, setAssignedAgentId] = useState<string>('')
  const [category, setCategory] = useState<TicketCategory | ''>('')
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => { pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addImageFiles = useCallback((files: File[]) => {
    setImageError(null)
    if (files.length === 0) return
    const accepted: PendingImage[] = []
    for (const f of files) {
      if (!ALLOWED_IMAGE_MIME.includes(f.type.toLowerCase())) {
        setImageError(`Format nicht unterstützt: ${f.name}`)
        continue
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setImageError(`Datei zu groß (max. 10 MB): ${f.name}`)
        continue
      }
      accepted.push({ id: crypto.randomUUID(), file: f, previewUrl: URL.createObjectURL(f) })
    }
    if (accepted.length === 0) return
    setPendingImages((prev) => {
      const merged = [...prev, ...accepted]
      if (merged.length > MAX_IMAGES) {
        setImageError(`Maximal ${MAX_IMAGES} Bilder pro Ticket`)
        merged.slice(MAX_IMAGES).forEach((p) => URL.revokeObjectURL(p.previewUrl))
        return merged.slice(0, MAX_IMAGES)
      }
      return merged
    })
  }, [])

  const removeImage = (id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((p) => p.id === id)
      if (img) URL.revokeObjectURL(img.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => ALLOWED_IMAGE_MIME.includes(f.type.toLowerCase()))
    if (files.length > 0) addImageFiles(files)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f && ALLOWED_IMAGE_MIME.includes(f.type.toLowerCase())) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      addImageFiles(files)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || isUploading) return

    let savedAttachments: MessageAttachment[] = []
    if (pendingImages.length > 0) {
      setIsUploading(true)
      const draftId = crypto.randomUUID()
      try {
        for (const img of pendingImages) {
          const base64 = await fileToBase64(img.file)
          const res = await ipc.saveAttachment(draftId, img.file.name, img.file.type, base64)
          if (res.success && res.attachment) {
            savedAttachments.push(res.attachment)
          } else {
            setImageError(res.error || 'Upload fehlgeschlagen')
            setIsUploading(false)
            return
          }
        }
      } catch (err) {
        setImageError((err as Error).message)
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    }

    const agent = agents.find((a) => a.id === assignedAgentId)
    const descPlain = htmlToPlainText(description)
    onCreate(
      title.trim(),
      descPlain ? description : undefined,
      agent?.id,
      agent?.name,
      category || undefined,
      savedAttachments.length > 0 ? savedAttachments : undefined,
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onPaste={handlePaste}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className="w-full max-w-[560px] bg-white relative"
        style={{ borderRadius: '20px', padding: '32px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}
      >
        {isDragging && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none border-2 border-dashed border-accent"
            style={{ backgroundColor: 'rgba(99,102,241,0.06)', borderRadius: '20px' }}
          >
            <div className="text-accent font-semibold text-sm">{t('ticketCreate.dropImages')}</div>
          </div>
        )}

        <h3 className="text-[22px] font-bold text-txt-primary mb-2">{t('ticketCreate.title')}</h3>
        <p className="text-[15px] text-txt-secondary mb-7">{t('ticketCreate.subtitle')}</p>
        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('ticketCreate.titleLabel')}</label>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('ticketCreate.titlePlaceholder')}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('common.description')}</label>
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder={t('common.optional')}
              className="rounded-[10px] bg-surface-dark border border-border overflow-hidden focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/10 transition-all"
              minHeight="140px"
            />
          </div>

          {/* Attachments */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('ticketCreate.attachments')}</label>
            <div className="flex flex-wrap gap-2">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                  <img src={img.previewUrl} alt={img.file.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Entfernen"
                  >
                    ×
                  </button>
                </div>
              ))}
              {pendingImages.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border border-dashed border-border text-txt-muted hover:text-accent hover:border-accent transition-colors flex items-center justify-center"
                  title={t('ticketCreate.addImage')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_MIME.join(',')}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addImageFiles(Array.from(e.target.files))
                  e.target.value = ''
                }}
              />
            </div>
            {imageError && <p className="text-xs text-red-500 mt-1.5">{imageError}</p>}
          </div>

          {/* Category */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('context.category')}</label>
            <div className="flex flex-wrap gap-1.5">
              {TICKET_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(category === cat.value ? '' : cat.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    category === cat.value ? 'ring-1' : 'opacity-50 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: cat.color + '15',
                    color: cat.color,
                    ringColor: cat.color,
                  }}
                >
                  {t(CATEGORY_LABEL_KEYS[cat.value])}
                </button>
              ))}
            </div>
          </div>

          {/* Assign Agent */}
          <div className="mb-7">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('ticketCreate.assignTo')}</label>
            <select
              value={assignedAgentId}
              onChange={(e) => setAssignedAgentId(e.target.value)}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            >
              <option value="">{t('context.unassigned')}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <button
            type="submit"
            disabled={!title.trim() || isUploading}
            className="w-full h-11 rounded-[10px] bg-accent hover:bg-accent-dark text-white text-[15px] font-semibold disabled:opacity-20 transition-all"
          >
            {isUploading ? t('ticketCreate.uploading') : t('common.create')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-3 text-sm text-txt-secondary hover:text-txt-primary transition-colors text-center"
          >
            {t('common.cancel')}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

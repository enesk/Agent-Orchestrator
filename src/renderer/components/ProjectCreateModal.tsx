import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  onClose: () => void
  onCreate: (name: string, description?: string) => void
}

export default function ProjectCreateModal({ onClose, onCreate }: Props) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), description.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] bg-white"
        style={{ borderRadius: '20px', padding: '32px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}
      >
        <h3 className="text-[22px] font-bold text-txt-primary mb-2">{t('projectCreate.title')}</h3>
        <p className="text-[15px] text-txt-secondary mb-7">{t('projectCreate.subtitle')}</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('projectCreate.nameLabel')}</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projectCreate.namePlaceholder')}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            />
          </div>
          <div className="mb-7">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('common.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('common.optional')}
              rows={3}
              className="w-full px-4 py-3 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted resize-none focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full h-11 rounded-[10px] bg-accent hover:bg-accent-dark text-white text-[15px] font-semibold disabled:opacity-20 transition-all"
          >
            {t('common.create')}
          </button>
          <button type="button" onClick={onClose} className="w-full mt-3 text-sm text-txt-secondary hover:text-txt-primary transition-colors text-center">
            {t('common.cancel')}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

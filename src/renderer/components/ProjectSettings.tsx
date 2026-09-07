import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { Project } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'

const PRESET_METADATA_KEYS = [
  { key: 'project_path', labelKey: 'projectSettings.metaPath' as const, placeholder: '/Users/name/projects/my-app' },
  { key: 'test_url', labelKey: 'projectSettings.metaTestUrl' as const, placeholder: 'https://staging.example.com' },
  { key: 'live_url', labelKey: 'projectSettings.metaLiveUrl' as const, placeholder: 'https://example.com' },
  { key: 'tech_stack', labelKey: 'projectSettings.metaTechStack' as const, placeholder: 'Laravel + React + TypeScript' },
]

interface Props {
  project: Project
  onUpdateProject: (id: string, updates: { name?: string; description?: string; metadata?: Record<string, string> }) => Promise<Project>
  onDeleteProject: (id: string) => Promise<void>
}

export default function ProjectSettings({ project, onUpdateProject, onDeleteProject }: Props) {
  const { t } = useLanguage()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [metadata, setMetadata] = useState<Record<string, string>>(project.metadata ?? {})
  const [customKey, setCustomKey] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changeCountRef = useRef(0)

  // Sync when project prop changes (switching projects)
  useEffect(() => {
    setName(project.name)
    setDescription(project.description ?? '')
    setMetadata(project.metadata ?? {})
    setSaved(false)
    setConfirmDelete(false)
    setCustomKey('')
    setCustomValue('')
    // Bump counter so the autosave effect knows to skip the next trigger
    changeCountRef.current += 1
  }, [project.id])

  // Also sync when project data changes externally (e.g. after sync)
  useEffect(() => {
    setName(project.name)
    setDescription(project.description ?? '')
    setMetadata(project.metadata ?? {})
    changeCountRef.current += 1
  }, [project.name, project.description, JSON.stringify(project.metadata)])

  // Serialize metadata for stable dependency comparison
  const metadataJson = JSON.stringify(metadata)

  // Autosave with debounce — skips programmatic state changes
  const savedCountRef = useRef(changeCountRef.current)
  useEffect(() => {
    // Skip if this render was caused by project switch or external data update
    if (changeCountRef.current !== savedCountRef.current) {
      savedCountRef.current = changeCountRef.current
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!name.trim()) return
      setSaving(true)
      try {
        const currentMeta: Record<string, string> = JSON.parse(metadataJson)
        // Clean metadata: remove empty values
        const cleanMeta: Record<string, string> = {}
        for (const [k, v] of Object.entries(currentMeta)) {
          if (v && v.trim()) cleanMeta[k] = v.trim()
        }
        await onUpdateProject(project.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          metadata: Object.keys(cleanMeta).length > 0 ? cleanMeta : undefined,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } finally {
        setSaving(false)
      }
    }, 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [name, description, metadataJson])

  const updateMeta = (key: string, value: string) => {
    setMetadata((prev) => ({ ...prev, [key]: value }))
  }

  const removeMeta = (key: string) => {
    setMetadata((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addCustomField = () => {
    if (!customKey.trim()) return
    const key = customKey.trim().toLowerCase().replace(/\s+/g, '_')
    setMetadata((prev) => ({ ...prev, [key]: customValue }))
    setCustomKey('')
    setCustomValue('')
  }

  // Custom keys = keys not in presets
  const presetKeys = new Set(PRESET_METADATA_KEYS.map((p) => p.key))
  const customEntries = Object.entries(metadata).filter(([k]) => !presetKeys.has(k))

  const handleDelete = async () => {
    await onDeleteProject(project.id)
  }

  const createdDate = new Date(project.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="w-full">
      <div className="max-w-[560px] mx-auto w-full py-8 px-6">
        <h2 className="text-xl font-bold text-txt-primary mb-1">{t('projectSettings.title')}</h2>
        <p className="text-sm text-txt-secondary mb-8">{t('projectSettings.subtitle')}</p>

        {/* Project Details */}
        <div className="bg-white rounded-2xl border border-border p-6 space-y-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div>
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('projectSettings.nameLabel')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projectCreate.namePlaceholder')}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('common.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projectSettings.descriptionPlaceholder')}
              rows={4}
              className="w-full px-4 py-3 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted resize-none focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all leading-relaxed"
            />
          </div>

          {/* Save status */}
          <div className="flex items-center h-5">
            {saving && (
              <span className="text-xs text-txt-muted flex items-center gap-1.5">
                <div className="w-3 h-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
                {t('projectSettings.saving')}
              </span>
            )}
            {saved && !saving && (
              <motion.span
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-status-success flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('projectSettings.saved')}
              </motion.span>
            )}
          </div>
        </div>

        {/* Project Metadata */}
        <div className="bg-white rounded-2xl border border-border p-6 mt-4 space-y-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div>
            <h3 className="text-sm font-semibold text-txt-primary mb-0.5">{t('projectSettings.metaTitle')}</h3>
            <p className="text-xs text-txt-muted">{t('projectSettings.metaSubtitle')}</p>
          </div>

          {/* Preset fields */}
          {PRESET_METADATA_KEYS.map((preset) => (
            <div key={preset.key}>
              <label className="block text-sm text-txt-body mb-1.5 font-medium">{t(preset.labelKey)}</label>
              <input
                value={metadata[preset.key] ?? ''}
                onChange={(e) => updateMeta(preset.key, e.target.value)}
                placeholder={preset.placeholder}
                className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all font-mono text-sm"
              />
            </div>
          ))}

          {/* Custom fields */}
          {customEntries.map(([key, value]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-txt-body font-medium font-mono">{key}</label>
                <button
                  onClick={() => removeMeta(key)}
                  className="text-xs text-txt-muted hover:text-status-error transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
              <input
                value={value}
                onChange={(e) => updateMeta(key, e.target.value)}
                className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all font-mono text-sm"
              />
            </div>
          ))}

          {/* Add custom field */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-txt-muted mb-2">{t('projectSettings.metaAddCustom')}</p>
            <div className="flex gap-2">
              <input
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder={t('projectSettings.metaKeyPlaceholder')}
                className="flex-1 px-3 h-10 rounded-[10px] bg-surface-dark border border-border text-sm text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
              />
              <input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={t('projectSettings.metaValuePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && addCustomField()}
                className="flex-1 px-3 h-10 rounded-[10px] bg-surface-dark border border-border text-sm text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
              />
              <button
                onClick={addCustomField}
                disabled={!customKey.trim()}
                className="px-4 h-10 rounded-[10px] bg-accent-muted text-accent text-sm font-medium hover:bg-accent/20 disabled:opacity-30 transition-all"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl border border-border p-6 mt-4 space-y-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wider">{t('projectSettings.info')}</h3>
          <div className="flex justify-between text-sm">
            <span className="text-txt-secondary">{t('projectSettings.created')}</span>
            <span className="text-txt-primary">{createdDate}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-txt-secondary">{t('projectSettings.agents')}</span>
            <span className="text-txt-primary">{project.agents.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-txt-secondary">{t('projectSettings.projectId')}</span>
            <span className="text-txt-muted text-xs font-mono truncate ml-4 max-w-[200px]">{project.id}</span>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl border border-status-error/20 p-6 mt-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 className="text-xs font-semibold text-status-error uppercase tracking-wider mb-3">{t('projectSettings.dangerZone')}</h3>
          <p className="text-sm text-txt-secondary mb-4">{t('projectSettings.deleteWarning')}</p>

          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="flex-1 h-11 rounded-[10px] bg-status-error text-white text-sm font-semibold hover:bg-status-error/90 transition-colors"
              >
                {t('projectSettings.confirmDelete')}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-5 h-11 rounded-[10px] text-sm text-txt-secondary hover:bg-surface-hover transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full h-11 rounded-[10px] border border-status-error/20 text-status-error text-sm font-medium hover:bg-status-error/5 transition-colors"
            >
              {t('projectSettings.deleteProject')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

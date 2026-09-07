import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../i18n/LanguageContext'
import { AGENT_MODELS, AGENT_MODEL_GROUPS, DEFAULT_AGENT_MODEL, AGENT_EFFORTS, DEFAULT_AGENT_EFFORT } from '@shared/constants'
import type { GlobalAgent } from '@shared/types'

type AgentData = { name: string; title?: string; systemPrompt: string; color: string; avatar?: string; model: string; effort: string }

interface Props {
  onClose: () => void
  onCreate: (data: AgentData) => void
  editAgent?: GlobalAgent
  onUpdate?: (id: string, data: AgentData) => void
}

const COLOR_SWATCHES = ['#6366f1', '#8b5cf6', '#22c55e', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#ef4444']
const AVATAR_EMOJIS = ['\u{1F9D1}\u200D\u{1F4BB}', '\u{1F3A8}', '\u{1F50D}', '\u{1F4CB}', '\u{1F916}', '\u2699\uFE0F', '\u{1F680}', '\u{1F4A1}']

export default function AgentCreateModal({ onClose, onCreate, editAgent, onUpdate }: Props) {
  const { t } = useLanguage()
  const isEdit = !!editAgent
  const [name, setName] = useState(editAgent?.name ?? '')
  const [title, setTitle] = useState(editAgent?.title ?? '')
  const [skillDescription, setSkillDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(editAgent?.systemPrompt ?? '')
  const [color, setColor] = useState(editAgent?.color ?? COLOR_SWATCHES[0])
  const [avatar, setAvatar] = useState<string | undefined>(editAgent?.avatar)
  // Model: a concrete id (e.g. "claude-opus-4-8"). The dropdown offers known versions plus a
  // "custom" sentinel; when custom is selected the effective model comes from the text field, so
  // any id the CLI supports works — and legacy alias values ("opus") show up as custom too.
  const CUSTOM_MODEL = '__custom__'
  const initialModel = editAgent?.model ?? DEFAULT_AGENT_MODEL
  const initialKnown = AGENT_MODELS.some((m) => m.value === initialModel)
  const [modelChoice, setModelChoice] = useState<string>(initialKnown ? initialModel : CUSTOM_MODEL)
  const [customModel, setCustomModel] = useState<string>(initialKnown ? '' : initialModel)
  const effectiveModel = (modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice) || DEFAULT_AGENT_MODEL
  // Effort: how deeply the agent thinks per turn — the second cost dial next to the model.
  const [effort, setEffort] = useState<string>(editAgent?.effort ?? DEFAULT_AGENT_EFFORT)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const mentionKey = name ? `@${name.toLowerCase().replace(/\s+/g, '')}` : '@...'

  const handleGeneratePrompt = async () => {
    if (!skillDescription.trim() || isGenerating) return
    setIsGenerating(true)
    setGenerateError('')
    try {
      const generated = await window.orchestrator.generateAgentPrompt(skillDescription.trim())
      setSystemPrompt(generated)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setGenerateError(`${t('common.error')}: ${msg}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || systemPrompt.length < 20) return
    const data: AgentData = { name: name.trim(), title: title.trim() || undefined, systemPrompt, color, avatar, model: effectiveModel, effort }
    if (isEdit && onUpdate) {
      onUpdate(editAgent.id, data)
    } else {
      onCreate(data)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] bg-white max-h-[90vh] overflow-y-auto"
        style={{ borderRadius: '20px', padding: '32px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}
      >
        <h3 className="text-[22px] font-bold text-txt-primary mb-2">
          {isEdit ? t('agentCreate.editTitle') : t('agentCreate.title')}
        </h3>
        <p className="text-[15px] text-txt-secondary mb-7">
          {isEdit ? t('agentCreate.editSubtitle') : t('agentCreate.subtitle')}
        </p>
        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('agentCreate.nameLabel')}</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentCreate.namePlaceholder')}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            />
            <p className="text-[13px] mt-1.5 text-txt-secondary">{t('agentCreate.mention')}<span style={{ color }}>{mentionKey}</span></p>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('agentCreate.titleLabel')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('agentCreate.titlePlaceholder')}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            />
          </div>

          {/* Model */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">Modell</label>
            <select
              value={modelChoice}
              onChange={(e) => setModelChoice(e.target.value)}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            >
              {AGENT_MODEL_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {AGENT_MODELS.filter((m) => m.group === group).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM_MODEL}>Eigenes Modell…</option>
            </select>
            {modelChoice === CUSTOM_MODEL && (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="z. B. claude-opus-4-8"
                className="w-full mt-2 px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all font-mono"
              />
            )}
            <p className="text-[13px] mt-1.5 text-txt-secondary">Bestimmt Kosten &amp; Qualität dieses Agenten. Opus/Fable nur wählen, wenn wirklich nötig.</p>
          </div>

          {/* Effort */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">Denktiefe (Effort)</label>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              className="w-full px-4 h-11 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
            >
              {AGENT_EFFORTS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
            <p className="text-[13px] mt-1.5 text-txt-secondary">
              Wie tief der Agent pro Zug denkt. Niedriger = weniger Tokens und schneller. Sonnet 4.5 und Haiku 4.5 unterstützen kein Effort, Opus/Sonnet 4.6 kein XHigh.
            </p>
          </div>

          {/* Skill Description + Generate */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('agentCreate.skillsLabel')}</label>
            <div className="flex gap-2">
              <textarea
                value={skillDescription}
                onChange={(e) => setSkillDescription(e.target.value)}
                placeholder={t('agentCreate.skillsPlaceholder')}
                rows={2}
                className="flex-1 px-4 py-3 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted resize-none focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={!skillDescription.trim() || isGenerating}
                className="self-end px-3 py-2.5 rounded-[10px] bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 disabled:opacity-30 transition-all whitespace-nowrap border border-accent/20"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('agentCreate.generating')}
                  </span>
                ) : (
                  t('agentCreate.generatePrompt')
                )}
              </button>
            </div>
            {generateError && (
              <p className="text-[13px] mt-1.5 text-status-error">{generateError}</p>
            )}
          </div>

          {/* System Prompt */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('agentCreate.promptLabel')}</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('agentCreate.promptPlaceholder')}
              rows={5}
              className="w-full px-4 py-3 rounded-[10px] bg-surface-dark border border-border text-[15px] text-txt-primary placeholder:text-txt-muted resize-none focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
              style={{ minHeight: '120px' }}
            />
          </div>

          {/* Color */}
          <div className="mb-4">
            <label className="block text-sm text-txt-body mb-2 font-medium">{t('agentCreate.color')}</label>
            <div className="flex gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-transform"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Avatar */}
          <div className="mb-7">
            <label className="block text-sm text-txt-body mb-2 font-medium">{t('agentCreate.avatar')}</label>
            <div className="flex gap-2">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(avatar === emoji ? undefined : emoji)}
                  className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-lg transition-all ${
                    avatar === emoji ? 'bg-accent/20 ring-2 ring-accent' : 'bg-surface-light hover:bg-surface-hover'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <button
            type="submit"
            disabled={!name.trim() || systemPrompt.length < 20}
            className="w-full h-11 rounded-[10px] bg-accent hover:bg-accent-dark text-white text-[15px] font-semibold disabled:opacity-20 transition-all"
          >
            {isEdit ? t('common.save') : t('common.create')}
          </button>
          <button type="button" onClick={onClose} className="w-full mt-3 text-sm text-txt-secondary hover:text-txt-primary transition-colors text-center">
            {t('common.cancel')}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  AGENT_COLORS,
  AGENT_EFFORTS,
  AGENT_MODELS,
  AGENT_ROLES,
  resolveEffortForModel,
  type AgentEffort,
  type AgentRole,
} from '@shared/constants'
import type { Agent } from '@shared/types'
import { useT } from '../../i18n'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useSkillStore } from '../../store/skillStore'
import { useUiStore } from '../../store/uiStore'
import { Button, Checkbox, Input, Select, Textarea, cn } from '../../ui'
import { AgentAvatar } from './AgentAvatar'
import { GeneratePromptModal } from './GeneratePromptModal'
import { effortLabelKey, previewMentionKey, roleDescriptionKey, roleLabelKey } from './agentHelpers'

const CUSTOM_MODEL = '__custom__'

interface Draft {
  name: string
  title: string
  mentionKey: string
  role: AgentRole
  model: string
  effort: AgentEffort
  color: string
  avatar: string
  systemPrompt: string
  skillIds: string[]
}

function toDraft(agent: Agent): Draft {
  return {
    name: agent.name,
    title: agent.title ?? '',
    mentionKey: agent.mentionKey,
    role: agent.role,
    model: agent.model,
    effort: agent.effort,
    color: agent.color,
    avatar: agent.avatar ?? '',
    systemPrompt: agent.systemPrompt,
    skillIds: [...agent.skillIds].sort(),
  }
}

export interface AgentEditorProps {
  agent: Agent
  onDuplicate: () => void
  onDelete: () => void
}

export function AgentEditor({ agent, onDuplicate, onDelete }: AgentEditorProps) {
  const t = useT()
  const update = useAgentStore((state) => state.update)
  const skills = useSkillStore((state) => state.skills)
  const setAgentsTab = useUiStore((state) => state.setAgentsTab)

  const modelOptions = useMemo(
    () => [
      ...AGENT_MODELS.map((option) => ({
        value: option.value,
        label: option.label,
        group: option.group,
      })),
      {
        value: CUSTOM_MODEL,
        label: t('agentEditor.customModelOption'),
        group: t('agentEditor.customModelGroup'),
      },
    ],
    [t],
  )
  const roleOptions = useMemo(
    () => AGENT_ROLES.map((option) => ({ value: option.value, label: t(roleLabelKey(option.value)) })),
    [t],
  )
  const effortOptions = useMemo(
    () => AGENT_EFFORTS.map((option) => ({ value: option.value, label: t(effortLabelKey(option.value)) })),
    [t],
  )

  const [draft, setDraft] = useState<Draft>(() => toDraft(agent))
  const [customModel, setCustomModel] = useState(() => isKnownModel(agent.model) ? '' : agent.model)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(toDraft(agent))
    setCustomModel(isKnownModel(agent.model) ? '' : agent.model)
    setError(null)
    setSaved(false)
    // Bewusst nur an der Id: fremde Aktualisierungen dürfen den offenen Entwurf nicht überschreiben.
  }, [agent.id])

  // Ein gelöschter Skill verschwindet auch aus dem offenen Entwurf — sonst scheitert das Speichern
  // am Fremdschlüssel und der Entwurf gälte grundlos als ungespeichert.
  const skillsLoaded = useSkillStore((state) => state.loaded)
  useEffect(() => {
    if (!skillsLoaded) return
    setDraft((current) => {
      const known = current.skillIds.filter((id) => skills.some((skill) => skill.id === id))
      return known.length === current.skillIds.length ? current : { ...current, skillIds: known }
    })
  }, [skills, skillsLoaded])

  const dirty = useMemo(() => !sameDraft(draft, toDraft(agent)), [draft, agent])
  const effortIgnored = resolveEffortForModel(draft.model, draft.effort) === null
  const modelMissing = draft.model.trim().length === 0

  function set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function save(): Promise<void> {
    const name = draft.name.trim()
    if (!name || modelMissing) return
    setSaving(true)
    setError(null)
    try {
      await update(agent.id, {
        name,
        title: draft.title.trim() || null,
        mentionKey: draft.mentionKey.trim() || name,
        role: draft.role,
        model: draft.model.trim(),
        effort: draft.effort,
        color: draft.color,
        avatar: draft.avatar.trim() || null,
        systemPrompt: draft.systemPrompt,
        skillIds: draft.skillIds,
      })
      setSaved(true)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  function toggleSkill(skillId: string, checked: boolean): void {
    const next = draft.skillIds.filter((id) => id !== skillId)
    set('skillIds', (checked ? [...next, skillId] : next).sort())
  }

  function applyGeneratedPrompt(systemPrompt: string, title: string | null): void {
    setDraft((current) => ({
      ...current,
      systemPrompt,
      title: current.title.trim() || (title ?? ''),
    }))
    setSaved(false)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <AgentAvatar name={draft.name} color={draft.color} avatar={draft.avatar || null} size="sm" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {draft.name || t('agentEditor.unnamed')}
        </h2>
        <span className="text-xs text-ink-faint">
          {dirty ? t('agentEditor.unsaved') : saved ? t('common.saved') : ''}
        </span>
        <Button size="sm" onClick={onDuplicate}>
          {t('agentEditor.duplicate')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {t('common.delete')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={!dirty || !draft.name.trim() || modelMissing}
          onClick={() => void save()}
        >
          {t('common.save')}
        </Button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('agent.create.name')}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder={t('agent.create.namePlaceholder')}
          />
          <Input
            label={t('agentEditor.title')}
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder={t('agentEditor.titlePlaceholder')}
          />
        </div>

        <Input
          label={t('agentEditor.mentionKey')}
          value={draft.mentionKey}
          onChange={(event) => set('mentionKey', event.target.value)}
          hint={t('agentEditor.mentionKeyHint', {
            key: previewMentionKey(draft.mentionKey || draft.name),
          })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('agent.create.role')}
            options={roleOptions}
            value={draft.role}
            onChange={(event) => set('role', event.target.value as AgentRole)}
          />
          <div className="self-end pb-2 text-xs text-ink-faint">{t(roleDescriptionKey(draft.role))}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('agentEditor.model')}
            options={modelOptions}
            value={isKnownModel(draft.model) ? draft.model : CUSTOM_MODEL}
            onChange={(event) => {
              const value = event.target.value
              set('model', value === CUSTOM_MODEL ? customModel : value)
            }}
          />
          <Select
            label={t('agentEditor.effort')}
            options={effortOptions}
            value={draft.effort}
            onChange={(event) => set('effort', event.target.value as AgentEffort)}
          />
        </div>

        {!isKnownModel(draft.model) && (
          <Input
            label={t('agentEditor.customModel')}
            value={customModel || draft.model}
            className="font-mono"
            onChange={(event) => {
              setCustomModel(event.target.value)
              set('model', event.target.value)
            }}
            placeholder="claude-…"
            error={modelMissing ? t('agentEditor.modelMissing') : null}
          />
        )}

        {effortIgnored && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
            {t('agentEditor.effortIgnored')}
          </p>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">{t('agentEditor.skills')}</span>
            <Button size="sm" variant="ghost" onClick={() => setAgentsTab('skills')}>
              {t('agentEditor.skillsManage')}
            </Button>
          </div>
          {skills.length === 0 ? (
            <p className="rounded-md border border-line px-3 py-2 text-xs text-ink-faint">
              {t('agentEditor.skillsEmpty')}
            </p>
          ) : (
            <ul className="max-h-56 divide-y divide-line overflow-auto rounded-md border border-line">
              {skills.map((skill) => (
                <li key={skill.id}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-raised">
                    <Checkbox
                      className="mt-0.5"
                      checked={draft.skillIds.includes(skill.id)}
                      onChange={(event) => toggleSkill(skill.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-xs font-medium text-ink">{skill.name}</span>
                        <span className="truncate font-mono text-[11px] text-ink-faint">{skill.slug}</span>
                      </span>
                      {skill.description && (
                        <span className="mt-0.5 block text-[11px] text-ink-muted">{skill.description}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-ink-faint">{t('agentEditor.skillsHint')}</p>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-muted">{t('agentEditor.color')}</span>
          <div className="flex flex-wrap gap-2">
            {AGENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={t('agentEditor.colorLabel', { color })}
                aria-pressed={draft.color === color}
                style={{ backgroundColor: color }}
                onClick={() => set('color', color)}
                className={cn(
                  'h-6 w-6 rounded-md border-2 transition-transform',
                  draft.color === color ? 'border-ink scale-110' : 'border-transparent',
                )}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[auto,1fr] items-end gap-3">
          <AgentAvatar name={draft.name} color={draft.color} avatar={draft.avatar || null} />
          <Input
            label={t('agentEditor.avatar')}
            value={draft.avatar}
            maxLength={4}
            onChange={(event) => set('avatar', event.target.value)}
            hint={t('agentEditor.avatarHint')}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">{t('agentEditor.systemPrompt')}</span>
            <Button size="sm" onClick={() => setPromptModalOpen(true)}>
              {t('agentEditor.generatePrompt')}
            </Button>
          </div>
          <Textarea
            rows={18}
            value={draft.systemPrompt}
            onChange={(event) => set('systemPrompt', event.target.value)}
            placeholder={t('agentEditor.systemPromptPlaceholder')}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <GeneratePromptModal
        open={promptModalOpen}
        agentName={draft.name}
        role={draft.role}
        hasPrompt={draft.systemPrompt.trim().length > 0}
        onClose={() => setPromptModalOpen(false)}
        onApply={applyGeneratedPrompt}
      />
    </div>
  )
}

function isKnownModel(model: string): boolean {
  return AGENT_MODELS.some((option) => option.value === model)
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (Object.keys(a) as (keyof Draft)[]).every((key) => {
    const left = a[key]
    const right = b[key]
    return Array.isArray(left) && Array.isArray(right)
      ? left.length === right.length && left.every((value, index) => value === right[index])
      : left === right
  })
}

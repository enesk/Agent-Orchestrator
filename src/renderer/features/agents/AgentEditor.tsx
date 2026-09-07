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
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, Input, Select, Textarea, cn } from '../../ui'
import { AgentAvatar } from './AgentAvatar'
import { GeneratePromptModal } from './GeneratePromptModal'
import { previewMentionKey, roleDescription } from './agentHelpers'

const CUSTOM_MODEL = '__custom__'

const MODEL_OPTIONS = [
  ...AGENT_MODELS.map((option) => ({
    value: option.value,
    label: option.label,
    group: option.group,
  })),
  { value: CUSTOM_MODEL, label: 'Eigene Modell-ID …', group: 'Sonstiges' },
]

const ROLE_OPTIONS = AGENT_ROLES.map((option) => ({ value: option.value, label: option.label }))
const EFFORT_OPTIONS = AGENT_EFFORTS.map((option) => ({
  value: option.value,
  label: option.label,
}))

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
  }
}

export interface AgentEditorProps {
  agent: Agent
  onDuplicate: () => void
  onDelete: () => void
}

export function AgentEditor({ agent, onDuplicate, onDelete }: AgentEditorProps) {
  const update = useAgentStore((state) => state.update)

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
      })
      setSaved(true)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
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
          {draft.name || 'Ohne Namen'}
        </h2>
        <span className="text-xs text-ink-faint">
          {dirty ? 'Nicht gespeichert' : saved ? 'Gespeichert' : ''}
        </span>
        <Button size="sm" onClick={onDuplicate}>
          Duplizieren
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Löschen
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={!dirty || !draft.name.trim() || modelMissing}
          onClick={() => void save()}
        >
          Speichern
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
            label="Name"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="z.B. Lena"
          />
          <Input
            label="Titel"
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder="z.B. Backend-Entwicklung"
          />
        </div>

        <Input
          label="Erwähnungskürzel"
          value={draft.mentionKey}
          onChange={(event) => set('mentionKey', event.target.value)}
          hint={`Wird gespeichert als ${previewMentionKey(draft.mentionKey || draft.name)} — bei Kollision hängt die App eine Zahl an.`}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Rolle"
            options={ROLE_OPTIONS}
            value={draft.role}
            onChange={(event) => set('role', event.target.value as AgentRole)}
          />
          <div className="self-end pb-2 text-xs text-ink-faint">{roleDescription(draft.role)}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Modell"
            options={MODEL_OPTIONS}
            value={isKnownModel(draft.model) ? draft.model : CUSTOM_MODEL}
            onChange={(event) => {
              const value = event.target.value
              set('model', value === CUSTOM_MODEL ? customModel : value)
            }}
          />
          <Select
            label="Effort"
            options={EFFORT_OPTIONS}
            value={draft.effort}
            onChange={(event) => set('effort', event.target.value as AgentEffort)}
          />
        </div>

        {!isKnownModel(draft.model) && (
          <Input
            label="Eigene Modell-ID"
            value={customModel || draft.model}
            className="font-mono"
            onChange={(event) => {
              setCustomModel(event.target.value)
              set('model', event.target.value)
            }}
            placeholder="claude-…"
            error={modelMissing ? 'Ohne Modell-ID kann der Agent nicht laufen.' : null}
          />
        )}

        {effortIgnored && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
            Dieses Modell kennt den Effort-Parameter nicht — die CLI ignoriert die Einstellung.
          </p>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-muted">Farbe</span>
          <div className="flex flex-wrap gap-2">
            {AGENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Farbe ${color}`}
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
            label="Avatar"
            value={draft.avatar}
            maxLength={4}
            onChange={(event) => set('avatar', event.target.value)}
            hint="Ein Emoji oder bis zu vier Zeichen. Leer lassen für die Initialen."
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Systemprompt</span>
            <Button size="sm" onClick={() => setPromptModalOpen(true)}>
              Prompt erzeugen
            </Button>
          </div>
          <Textarea
            rows={18}
            value={draft.systemPrompt}
            onChange={(event) => set('systemPrompt', event.target.value)}
            placeholder="Wer ist dieser Agent, wie arbeitet er, was darf er nicht?"
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
  return (Object.keys(a) as (keyof Draft)[]).every((key) => a[key] === b[key])
}

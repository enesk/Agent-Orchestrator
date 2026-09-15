import { useEffect, useMemo, useState } from 'react'
import { baseSkillSlug } from '@shared/skillSlug'
import type { Skill } from '@shared/types'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useSkillStore } from '../../store/skillStore'
import { Button, Input, Markdown, Textarea } from '../../ui'

interface Draft {
  name: string
  slug: string
  description: string
  content: string
}

function toDraft(skill: Skill): Draft {
  return {
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    content: skill.content,
  }
}

export interface SkillEditorProps {
  skill: Skill
  onDelete: () => void
}

export function SkillEditor({ skill, onDelete }: SkillEditorProps) {
  const t = useT()
  const update = useSkillStore((state) => state.update)

  const [draft, setDraft] = useState<Draft>(() => toDraft(skill))
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(toDraft(skill))
    setError(null)
    setSaved(false)
    // Bewusst nur an der Id: fremde Aktualisierungen dürfen den offenen Entwurf nicht überschreiben.
  }, [skill.id])

  const current = toDraft(skill)
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((key) => draft[key] !== current[key])
  const slugPreview = useMemo(
    () => baseSkillSlug(draft.slug.trim() || draft.name),
    [draft.slug, draft.name],
  )

  function set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setSaved(false)
  }

  async function save(): Promise<void> {
    const name = draft.name.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      const next = await update(skill.id, {
        name,
        slug: draft.slug.trim() || name,
        description: draft.description,
        content: draft.content,
      })
      // Der Main-Prozess kann den Slug um einen Zähler ergänzt haben.
      setDraft(toDraft(next))
      setSaved(true)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {draft.name || skill.name}
        </h2>
        <span className="text-xs text-ink-faint">
          {dirty ? t('agentEditor.unsaved') : saved ? t('common.saved') : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {t('common.delete')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={!dirty || !draft.name.trim()}
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('skills.name')}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder={t('skills.namePlaceholder')}
          />
          <Input
            label={t('skills.slug')}
            value={draft.slug}
            className="font-mono"
            onChange={(event) => set('slug', event.target.value)}
            hint={t('skills.slugHint', { slug: slugPreview })}
          />
        </div>

        <Textarea
          label={t('skills.description')}
          rows={3}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder={t('skills.descriptionPlaceholder')}
          hint={t('skills.descriptionHint')}
          error={draft.description.trim() ? null : t('skills.descriptionMissing')}
        />

        <div className="flex min-h-[18rem] flex-1 flex-col">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">{t('skills.content')}</span>
            <Button size="sm" onClick={() => setPreview((value) => !value)}>
              {preview ? t('common.edit') : t('skills.preview')}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-surface p-4">
              {draft.content.trim() ? (
                <Markdown content={draft.content} />
              ) : (
                <p className="text-xs text-ink-faint">{t('skills.contentEmpty')}</p>
              )}
            </div>
          ) : (
            <textarea
              value={draft.content}
              onChange={(event) => set('content', event.target.value)}
              spellCheck={false}
              placeholder={t('skills.contentPlaceholder')}
              className="min-h-0 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          )}
        </div>
      </div>
    </div>
  )
}

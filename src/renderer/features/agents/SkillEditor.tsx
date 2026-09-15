import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { baseSkillSlug } from '@shared/skillSlug'
import type { Skill, SkillFile } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useSkillStore } from '../../store/skillStore'
import { Button, IconButton, Input, Markdown, Textarea, cn, useConfirm } from '../../ui'
import { TrashIcon } from '../../ui/icons'
import { readFileAsBase64 } from '../attachments/attachmentHelpers'

const DEFAULT_FILE_FOLDER = 'references'

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
  const format = useFormat()
  const update = useSkillStore((state) => state.update)
  const addFile = useSkillStore((state) => state.addFile)
  const removeFile = useSkillStore((state) => state.removeFile)
  const { confirm, dialog } = useConfirm()

  const [draft, setDraft] = useState<Draft>(() => toDraft(skill))
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folder, setFolder] = useState(DEFAULT_FILE_FOLDER)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [exportedTo, setExportedTo] = useState<string | null>(null)

  useEffect(() => {
    setDraft(toDraft(skill))
    setError(null)
    setSaved(false)
    setExportedTo(null)
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

  async function dropFiles(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setFileDragOver(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    const prefix = folder.trim().replace(/^\/+|\/+$/g, '')
    setFileBusy(true)
    setError(null)
    try {
      for (const file of files) {
        await addFile({
          skillId: skill.id,
          relPath: prefix ? `${prefix}/${file.name}` : file.name,
          dataBase64: await readFileAsBase64(file),
        })
      }
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setFileBusy(false)
    }
  }

  async function deleteFile(file: SkillFile): Promise<void> {
    const confirmed = await confirm({
      title: t('skills.files.delete.title'),
      message: t('skills.files.delete.message', { path: file.relPath }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    setError(null)
    try {
      await removeFile(skill.id, file.id)
    } catch (caught) {
      setError(toErrorMessage(caught))
    }
  }

  async function exportSkill(): Promise<void> {
    setError(null)
    setExportedTo(null)
    try {
      const result = await window.api.skills.export({ id: skill.id })
      setExportedTo(result.path)
    } catch (caught) {
      setError(toErrorMessage(caught))
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
        <Button
          size="sm"
          variant="ghost"
          title={dirty ? t('skills.export.unsavedHint') : undefined}
          onClick={() => void exportSkill()}
        >
          {t('skills.export.button')}
        </Button>
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
      {exportedTo && (
        <p className="shrink-0 truncate border-b border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
          {t('skills.export.done', { path: exportedTo })}
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

        <div
          className={cn(
            'rounded-md border border-line p-2 transition-colors',
            fileDragOver && 'border-accent bg-accent-soft',
          )}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setFileDragOver(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFileDragOver(false)
            }
          }}
          onDrop={(event) => void dropFiles(event)}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('skills.files.title', { count: skill.files.length })}
            </span>
            {fileBusy && <span className="text-xs text-ink-faint">{t('common.saving')}</span>}
          </div>
          <p className="mb-2 text-xs text-ink-faint">{t('skills.files.hint')}</p>

          {skill.files.length > 0 && (
            <ul className="mb-2 divide-y divide-line rounded-md border border-line bg-surface">
              {skill.files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 py-0.5 pl-3 pr-1 text-xs">
                  <span className="min-w-0 flex-1 truncate font-mono text-ink">{file.relPath}</span>
                  <span className="shrink-0 text-ink-faint">{format.bytes(file.size)}</span>
                  <IconButton
                    label={t('skills.files.remove', { path: file.relPath })}
                    icon={<TrashIcon width={14} height={14} />}
                    tone="danger"
                    className="h-7 w-7"
                    onClick={() => void deleteFile(file)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2 rounded-md border border-dashed border-line px-2 py-2">
            <Input
              label={t('skills.files.folder')}
              value={folder}
              className="w-40 font-mono"
              onChange={(event) => setFolder(event.target.value)}
            />
            <p className="flex-1 pb-2 text-xs text-ink-faint">
              {t('skills.files.dropHint', { folder: folder.trim() || '.' })}
            </p>
          </div>
        </div>
      </div>
      {dialog}
    </div>
  )
}

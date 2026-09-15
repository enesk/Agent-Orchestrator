import { useEffect, useMemo, useState } from 'react'
import { baseSkillSlug } from '@shared/skillSlug'
import type { Skill, SkillImportPreview } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useSkillStore } from '../../store/skillStore'
import { Button, Input, Modal } from '../../ui'

export const SKILL_IMPORT_ACCEPT = '.md,.markdown,.zip'

export function isSkillImportFile(fileName: string): boolean {
  return /\.(md|markdown|zip)$/i.test(fileName)
}

export interface SkillImportModalProps {
  preview: SkillImportPreview | null
  onClose: () => void
  onImported: (skill: Skill) => void
}

/** Zeigt, was hereinkommt, bevor etwas gespeichert wird — Name und Slug lassen sich noch ändern. */
export function SkillImportModal({ preview, onClose, onImported }: SkillImportModalProps) {
  const t = useT()
  const format = useFormat()
  const confirmImport = useSkillStore((state) => state.confirmImport)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(preview?.name ?? '')
    setSlug(preview?.slug ?? '')
    setError(null)
  }, [preview?.token])

  const slugPreview = useMemo(() => baseSkillSlug(slug.trim() || name), [slug, name])
  const totalSize = preview?.files.reduce((sum, file) => sum + file.size, 0) ?? 0

  function cancel(): void {
    if (preview) void window.api.skills.discardImport({ token: preview.token })
    onClose()
  }

  async function submit(): Promise<void> {
    if (!preview || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const skill = await confirmImport({
        token: preview.token,
        name: name.trim(),
        slug: slug.trim() || undefined,
      })
      onImported(skill)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={preview !== null}
      title={t('skills.import.title')}
      width="md"
      onClose={cancel}
      footer={
        <>
          <Button onClick={cancel}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            {t('skills.import.confirm')}
          </Button>
        </>
      }
    >
      {preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('skills.name')}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              label={t('skills.slug')}
              className="font-mono"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              hint={t('skills.slugHint', { slug: slugPreview })}
            />
          </div>

          <div>
            <span className="text-xs font-medium text-ink-muted">{t('skills.description')}</span>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {preview.description}
            </p>
          </div>

          <p className="text-xs text-ink-muted">
            {t('skills.import.contentLength', { count: preview.contentLength })}
          </p>

          <div>
            <span className="text-xs font-medium text-ink-muted">
              {preview.files.length > 0
                ? t('skills.import.files', {
                    count: preview.files.length,
                    size: format.bytes(totalSize),
                  })
                : t('skills.import.noFiles')}
            </span>
            {preview.files.length > 0 && (
              <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-line bg-surface py-1">
                {preview.files.map((file) => (
                  <li
                    key={file.relPath}
                    className="flex items-center justify-between gap-3 px-3 py-0.5 text-xs"
                  >
                    <span className="truncate font-mono text-ink">{file.relPath}</span>
                    <span className="shrink-0 text-ink-faint">{format.bytes(file.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

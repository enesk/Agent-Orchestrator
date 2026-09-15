import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { ProjectAgent, Skill, SkillImportPreview } from '@shared/types'
import { useT } from '../../i18n'
import { readFileAsBase64 } from '../attachments/attachmentHelpers'
import { toErrorMessage } from '../../store/errorMessage'
import { useSkillStore } from '../../store/skillStore'
import { Button, EmptyState, Input, Modal, Spinner, cn, useConfirm } from '../../ui'
import { DocumentIcon, PlusIcon } from '../../ui/icons'
import { SkillEditor } from './SkillEditor'
import { isSkillImportFile, SKILL_IMPORT_ACCEPT, SkillImportModal } from './SkillImportModal'

export interface SkillsPanelProps {
  agents: ProjectAgent[]
}

export function SkillsPanel({ agents }: SkillsPanelProps) {
  const t = useT()
  const skills = useSkillStore((state) => state.skills)
  const loading = useSkillStore((state) => state.loading)
  const storeError = useSkillStore((state) => state.error)
  const create = useSkillStore((state) => state.create)
  const remove = useSkillStore((state) => state.remove)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<SkillImportPreview | null>(null)
  const [reading, setReading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    setSelectedId((current) =>
      current && skills.some((skill) => skill.id === current) ? current : skills[0]?.id ?? null,
    )
  }, [skills])

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const agent of agents) {
      for (const skillId of agent.skillIds) counts.set(skillId, (counts.get(skillId) ?? 0) + 1)
    }
    return counts
  }, [agents])

  const selected = skills.find((skill) => skill.id === selectedId) ?? null

  async function submitCreate(): Promise<void> {
    const name = nameDraft.trim()
    if (!name) return
    setBusy(true)
    setActionError(null)
    try {
      const skill = await create({ name })
      setSelectedId(skill.id)
      setCreateOpen(false)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function readImport(files: File[]): Promise<void> {
    const file = files[0]
    if (!file) return
    setActionError(null)
    if (files.length > 1) {
      setActionError(t('skills.import.oneAtATime'))
      return
    }
    if (!isSkillImportFile(file.name)) {
      setActionError(t('skills.import.wrongType', { name: file.name }))
      return
    }
    setReading(true)
    try {
      const dataBase64 = await readFileAsBase64(file)
      setImportPreview(await window.api.skills.previewImport({ fileName: file.name, dataBase64 }))
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setReading(false)
    }
  }

  function pickImport(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void readImport(files)
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault()
    setDragOver(false)
    void readImport(Array.from(event.dataTransfer.files))
  }

  async function deleteSkill(skill: Skill): Promise<void> {
    const count = usage.get(skill.id) ?? 0
    const confirmed = await confirm({
      title: t('skills.delete.title'),
      message:
        count > 0
          ? t('skills.delete.messageAssigned', { name: skill.name, count })
          : t('skills.delete.message', { name: skill.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    setActionError(null)
    try {
      await remove(skill.id)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          'flex w-72 shrink-0 flex-col border-r border-line bg-surface transition-colors',
          dragOver && 'bg-accent-soft',
        )}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false)
        }}
        onDrop={onDrop}
      >
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
          <span className="text-sm font-medium text-ink">{t('skills.title')}</span>
          {(loading || reading) && <Spinner size={14} />}
          <span className="flex-1" />
          <Button
            size="sm"
            loading={reading}
            title={t('skills.import.hint')}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('skills.import.button')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={SKILL_IMPORT_ACCEPT}
            className="hidden"
            onChange={pickImport}
          />
          <Button
            size="sm"
            variant="primary"
            icon={<PlusIcon width={14} height={14} />}
            onClick={() => {
              setNameDraft('')
              setActionError(null)
              setCreateOpen(true)
            }}
          >
            {t('skills.new')}
          </Button>
        </div>

        {(storeError || actionError) && !createOpen && (
          <p className="border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        <ul className="min-h-0 flex-1 overflow-auto p-2">
          {!loading && skills.length === 0 && (
            <li className="px-1 py-4 text-center text-xs text-ink-faint">{t('skills.empty')}</li>
          )}
          {!loading && (skills.length === 0 || dragOver) && (
            <li className="mx-1 rounded-md border border-dashed border-line px-2 py-3 text-center text-xs text-ink-faint">
              {t('skills.import.dropHint')}
            </li>
          )}
          {skills.map((skill) => (
            <li key={skill.id}>
              <button
                type="button"
                onClick={() => setSelectedId(skill.id)}
                className={cn(
                  'mb-1 w-full rounded-md px-2 py-1.5 text-left transition-colors',
                  skill.id === selectedId
                    ? 'bg-accent-soft text-ink'
                    : 'text-ink-muted hover:bg-raised hover:text-ink',
                )}
              >
                <span className="block truncate text-xs font-medium">{skill.name}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-faint">
                  {skill.slug}
                  {usage.get(skill.id)
                    ? ` · ${t('skills.list.agentCount', { count: usage.get(skill.id)! })}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <SkillEditor skill={selected} onDelete={() => void deleteSkill(selected)} />
      ) : (
        <EmptyState
          title={t('skills.none.title')}
          description={t('skills.none.description')}
          icon={<DocumentIcon />}
          className="flex-1"
        />
      )}

      <Modal
        open={createOpen}
        title={t('skills.create.title')}
        width="sm"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!nameDraft.trim()}
              onClick={() => void submitCreate()}
            >
              {t('common.create')}
            </Button>
          </>
        }
      >
        <Input
          label={t('skills.name')}
          autoFocus
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submitCreate()
          }}
          placeholder={t('skills.namePlaceholder')}
        />
        {actionError && <p className="mt-2 text-xs text-danger">{actionError}</p>}
      </Modal>
      <SkillImportModal
        preview={importPreview}
        onClose={() => setImportPreview(null)}
        onImported={(skill) => {
          setImportPreview(null)
          setSelectedId(skill.id)
        }}
      />
      {dialog}
    </div>
  )
}

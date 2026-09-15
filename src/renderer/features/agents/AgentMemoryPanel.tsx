import { useCallback, useEffect, useMemo, useState } from 'react'
import { MEMORY_INDEX_CHAR_LIMIT, buildMemoryIndex } from '@shared/memoryIndex'
import type { Agent, AgentMemory } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import {
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  cn,
  useConfirm,
} from '../../ui'
import { CloseIcon, PlusIcon } from '../../ui/icons'

type MemorySort = 'importance' | 'length' | 'access'

export interface AgentMemoryPanelProps {
  agent: Agent
}

export function AgentMemoryPanel({ agent }: AgentMemoryPanelProps) {
  const t = useT()
  const format = useFormat()
  const projects = useProjectStore((state) => state.projects)

  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [sort, setSort] = useState<MemorySort>('importance')
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  const sorted = useMemo(() => {
    // The list arrives ordered by importance and recency; sort is stable, so ties keep that order.
    if (sort === 'importance') return memories
    const measure = (memory: AgentMemory): number =>
      sort === 'length' ? memory.value.length : memory.accessCount
    return [...memories].sort((a, b) => measure(b) - measure(a))
  }, [memories, sort])

  // Same builder as the prompt, uncapped, so the number shows how big the index really is.
  const indexChars = useMemo(() => buildMemoryIndex(memories, Infinity).text.length, [memories])
  // A prompt only ever sees one project plus the global entries, so the cap applies per project.
  const indexCapped = useMemo(() => {
    const projectIds = new Set(memories.map((memory) => memory.projectId))
    return [...projectIds].some((projectId) => {
      const scoped = memories.filter((memory) => memory.projectId === projectId || memory.projectId === null)
      return buildMemoryIndex(scoped).omitted > 0
    })
  }, [memories])
  const checkedCount = memories.filter((memory) => checkedIds.has(memory.id)).length
  const allChecked = memories.length > 0 && checkedCount === memories.length

  const sortOptions = useMemo(
    () => [
      { value: 'importance', label: t('memory.sort.importance') },
      { value: 'length', label: t('memory.sort.length') },
      { value: 'access', label: t('memory.sort.access') },
    ],
    [t],
  )

  const load = useCallback(async (agentId: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setMemories(await window.api.memory.list({ agentId }))
    } catch (caught) {
      setMemories([])
      setError(toErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setCheckedIds(new Set())
    void load(agent.id)
  }, [agent.id, load])

  function toggleChecked(id: number): void {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(): void {
    setCheckedIds(allChecked ? new Set() : new Set(memories.map((memory) => memory.id)))
  }

  async function removeChecked(): Promise<void> {
    const ids = memories.filter((memory) => checkedIds.has(memory.id)).map((memory) => memory.id)
    if (ids.length === 0) return
    const confirmed = await confirm({
      title: t('memory.deleteMany.title'),
      message: t('memory.deleteMany.message', { count: ids.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await window.api.memory.removeMany({ ids })
      const removed = new Set(ids)
      setMemories((current) => current.filter((item) => !removed.has(item.id)))
      setCheckedIds(new Set())
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove(memory: AgentMemory): Promise<void> {
    const confirmed = await confirm({
      title: t('memory.delete.title'),
      message: t('memory.delete.message', { key: memory.key }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    try {
      await window.api.memory.remove({ id: memory.id })
      setMemories((current) => current.filter((item) => item.id !== memory.id))
    } catch (caught) {
      setError(toErrorMessage(caught))
    }
  }

  async function clearAll(): Promise<void> {
    const confirmed = await confirm({
      title: t('memory.clear.title'),
      message: t('memory.clear.message', { count: memories.length, name: agent.name }),
      confirmLabel: t('memory.clearAll'),
      danger: true,
    })
    if (!confirmed) return
    try {
      await window.api.memory.clear({ agentId: agent.id })
      setMemories([])
      setCheckedIds(new Set())
    } catch (caught) {
      setError(toErrorMessage(caught))
    }
  }

  function projectLabel(projectId: string | null): string {
    if (!projectId) return t('memory.scope.global')
    return projects.find((project) => project.id === projectId)?.name ?? t('memory.scope.unknownProject')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {t('memory.title', { name: agent.name })}
        </h2>
        {loading && <Spinner size={14} />}
        <Button
          size="sm"
          icon={<PlusIcon width={14} height={14} />}
          onClick={() => setCreateOpen(true)}
        >
          {t('memory.entry')}
        </Button>
        <Button size="sm" variant="ghost" disabled={memories.length === 0} onClick={() => void clearAll()}>
          {t('memory.clearAll')}
        </Button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      {memories.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-ink-muted">
            <Checkbox
              checked={allChecked}
              indeterminate={checkedCount > 0 && !allChecked}
              onChange={toggleAll}
            />
            {t('memory.selectAll')}
          </label>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">
            {t('memory.summary', { count: memories.length, chars: format.number(indexChars) })}
            {indexCapped &&
              ` · ${t('memory.summaryCapped', { limit: format.number(MEMORY_INDEX_CHAR_LIMIT) })}`}
          </span>
          <Select
            options={sortOptions}
            value={sort}
            onChange={(event) => setSort(event.target.value as MemorySort)}
            className="w-44"
          />
        </div>
      )}

      {checkedCount > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-raised px-3 py-1.5">
          <span className="text-xs text-ink-muted">{t('memory.selected', { count: checkedCount })}</span>
          <div className="flex-1" />
          <Button size="sm" disabled={busy} onClick={() => setCheckedIds(new Set())}>
            {t('memory.clearSelection')}
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => void removeChecked()}>
            {t('common.delete')}
          </Button>
        </div>
      )}

      {!loading && memories.length === 0 ? (
        <EmptyState
          title={t('memory.empty.title')}
          description={t('memory.empty.description')}
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto p-3">
          {sorted.map((memory) => (
            <li
              key={memory.id}
              className={cn(
                'mb-2 flex items-start gap-2 rounded-lg border bg-surface p-3',
                checkedIds.has(memory.id) ? 'border-accent' : 'border-line',
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={checkedIds.has(memory.id)}
                onChange={() => toggleChecked(memory.id)}
                aria-label={memory.key}
              />
              <ImportanceDots value={memory.importance} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-ink">{memory.key}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-muted">
                  {memory.value}
                </p>
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  {projectLabel(memory.projectId)} ·{' '}
                  {memory.source === 'user' ? t('memory.source.user') : t('memory.source.agent')} ·{' '}
                  {t('memory.length', { chars: format.number(memory.value.length) })} ·{' '}
                  {t('memory.readCount', { count: memory.accessCount })} ·{' '}
                  {format.dateTime(memory.updatedAt)}
                </p>
              </div>
              <IconButton
                label={t('memory.delete.title')}
                icon={<CloseIcon width={16} height={16} />}
                onClick={() => void remove(memory)}
              />
            </li>
          ))}
        </ul>
      )}

      <CreateMemoryModal
        open={createOpen}
        agentId={agent.id}
        onClose={() => setCreateOpen(false)}
        onSaved={(memory) => setMemories((current) => [memory, ...current])}
      />
      {dialog}
    </div>
  )
}

function ImportanceDots({ value }: { value: number }) {
  const t = useT()
  const label = t('memory.importanceDots', { value })
  return (
    <span className="mt-1 flex shrink-0 flex-col gap-1" title={label} aria-label={label}>
      {[3, 2, 1].map((level) => (
        <span
          key={level}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            level <= value ? 'bg-accent' : 'bg-line-strong',
          )}
        />
      ))}
    </span>
  )
}

interface CreateMemoryModalProps {
  open: boolean
  agentId: string
  onClose: () => void
  onSaved: (memory: AgentMemory) => void
}

function CreateMemoryModal({ open, agentId, onClose, onSaved }: CreateMemoryModalProps) {
  const t = useT()
  const projects = useProjectStore((state) => state.projects)
  const importanceOptions = useMemo(
    () => [
      { value: '1', label: t('memory.importance.1') },
      { value: '2', label: t('memory.importance.2') },
      { value: '3', label: t('memory.importance.3') },
    ],
    [t],
  )

  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [importance, setImportance] = useState('2')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setKey('')
    setValue('')
    setImportance('2')
    setProjectId('')
    setSaving(false)
    setError(null)
  }, [open])

  async function submit(): Promise<void> {
    const trimmedKey = key.trim()
    if (!trimmedKey) return
    setSaving(true)
    setError(null)
    try {
      const memory = await window.api.memory.save({
        agentId,
        projectId: projectId || null,
        key: trimmedKey,
        value,
        importance: Number(importance),
        source: 'user',
      })
      onSaved(memory)
      onClose()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('memory.create.title')}
      width="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!key.trim()} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={t('memory.create.key')}
          autoFocus
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={t('memory.create.keyPlaceholder')}
          className="font-mono"
        />
        <Textarea
          label={t('memory.create.value')}
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('memory.create.valuePlaceholder')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('memory.create.importance')}
            options={importanceOptions}
            value={importance}
            onChange={(event) => setImportance(event.target.value)}
          />
          <Select
            label={t('memory.create.scope')}
            options={[
              { value: '', label: t('memory.create.allProjects') },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

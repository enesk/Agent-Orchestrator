import { useCallback, useEffect, useState } from 'react'
import type { Agent, AgentMemory } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import { Button, EmptyState, IconButton, Input, Modal, Select, Spinner, Textarea, cn, formatDateTime } from '../../ui'
import { CloseIcon, PlusIcon } from '../../ui/icons'

const IMPORTANCE_OPTIONS = [
  { value: '1', label: 'Beiläufig' },
  { value: '2', label: 'Normal' },
  { value: '3', label: 'Wichtig' },
]

export interface AgentMemoryPanelProps {
  agent: Agent
}

export function AgentMemoryPanel({ agent }: AgentMemoryPanelProps) {
  const projects = useProjectStore((state) => state.projects)

  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

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
    void load(agent.id)
  }, [agent.id, load])

  async function remove(memory: AgentMemory): Promise<void> {
    if (!window.confirm(`Erinnerung „${memory.key}" löschen?`)) return
    try {
      await window.api.memory.remove({ id: memory.id })
      setMemories((current) => current.filter((item) => item.id !== memory.id))
    } catch (caught) {
      setError(toErrorMessage(caught))
    }
  }

  async function clearAll(): Promise<void> {
    if (!window.confirm(`Alle ${memories.length} Erinnerungen von „${agent.name}" löschen?`)) return
    try {
      await window.api.memory.clear({ agentId: agent.id })
      setMemories([])
    } catch (caught) {
      setError(toErrorMessage(caught))
    }
  }

  function projectLabel(projectId: string | null): string {
    if (!projectId) return 'projektübergreifend'
    return projects.find((project) => project.id === projectId)?.name ?? 'Unbekanntes Projekt'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          Gedächtnis von {agent.name}
        </h2>
        {loading && <Spinner size={14} />}
        <Button
          size="sm"
          icon={<PlusIcon width={14} height={14} />}
          onClick={() => setCreateOpen(true)}
        >
          Eintrag
        </Button>
        <Button size="sm" variant="ghost" disabled={memories.length === 0} onClick={() => void clearAll()}>
          Alle löschen
        </Button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      {!loading && memories.length === 0 ? (
        <EmptyState
          title="Noch keine Erinnerungen"
          description="Der Agent legt sie im Gespräch selbst an — du kannst ihm aber auch etwas mitgeben."
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto p-3">
          {memories.map((memory) => (
            <li
              key={memory.id}
              className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-surface p-3"
            >
              <ImportanceDots value={memory.importance} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-ink">{memory.key}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-muted">
                  {memory.value}
                </p>
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  {projectLabel(memory.projectId)} · {memory.source === 'user' ? 'von dir' : 'vom Agenten'} ·{' '}
                  {memory.accessCount}× gelesen · {formatDateTime(memory.updatedAt)}
                </p>
              </div>
              <IconButton
                label="Erinnerung löschen"
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
    </div>
  )
}

function ImportanceDots({ value }: { value: number }) {
  return (
    <span
      className="mt-1 flex shrink-0 flex-col gap-1"
      title={`Wichtigkeit ${value} von 3`}
      aria-label={`Wichtigkeit ${value} von 3`}
    >
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
  const projects = useProjectStore((state) => state.projects)

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
      title="Erinnerung anlegen"
      width="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} disabled={!key.trim()} onClick={() => void submit()}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Schlüssel"
          autoFocus
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="z.B. deployment"
          className="font-mono"
        />
        <Textarea
          label="Wert"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Was soll sich der Agent merken?"
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Wichtigkeit"
            options={IMPORTANCE_OPTIONS}
            value={importance}
            onChange={(event) => setImportance(event.target.value)}
          />
          <Select
            label="Gilt für"
            options={[
              { value: '', label: 'Alle Projekte' },
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

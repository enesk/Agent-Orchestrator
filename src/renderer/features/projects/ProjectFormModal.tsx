import { useEffect, useState } from 'react'
import type { JsonObject, Project } from '@shared/types'
import { useT } from '../../i18n'
import { roleLabelKey } from '../agents/agentHelpers'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { Badge, Button, IconButton, Input, Modal, Textarea } from '../../ui'
import { CloseIcon, FolderIcon, PlusIcon } from '../../ui/icons'

interface MetadataPair {
  key: string
  value: string
}

export interface ProjectFormModalProps {
  open: boolean
  /** `null` legt ein neues Projekt an. */
  project: Project | null
  onClose: () => void
}

/**
 * Freie Metadaten werden als Zeichenketten geführt — die Felder sind für Dinge wie
 * `test_url` oder `tech_stack` gedacht, nicht für verschachtelte Strukturen.
 */
function toPairs(metadata: JsonObject): MetadataPair[] {
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }))
}

function toMetadata(pairs: MetadataPair[]): JsonObject {
  const metadata: JsonObject = {}
  for (const pair of pairs) {
    const key = pair.key.trim()
    if (key) metadata[key] = pair.value
  }
  return metadata
}

export function ProjectFormModal({ open, project, onClose }: ProjectFormModalProps) {
  const t = useT()
  const createProject = useProjectStore((state) => state.create)
  const updateProject = useProjectStore((state) => state.update)
  const setActiveProject = useUiStore((state) => state.setActiveProject)
  const openAgents = useUiStore((state) => state.openAgents)

  const allAgents = useAgentStore((state) => state.allAgents)
  const loadAllAgents = useAgentStore((state) => state.loadAll)
  const addManyToProject = useAgentStore((state) => state.addManyToProject)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [path, setPath] = useState('')
  const [pairs, setPairs] = useState<MetadataPair[]>([])
  /** `null` heißt „noch nichts angefasst" — dann gilt die Vorauswahl aller Worker. */
  const [agentIds, setAgentIds] = useState<string[] | null>(null)
  const [pathWarning, setPathWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || project) return
    void loadAllAgents()
  }, [open, project, loadAllAgents])

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setPath(project?.path ?? '')
    setPairs(project ? toPairs(project.metadata) : [])
    setAgentIds(null)
    setPathWarning(null)
    setError(null)
    setSaving(false)
  }, [open, project])

  const selectedAgentIds =
    agentIds ?? allAgents.filter((agent) => agent.role === 'worker').map((agent) => agent.id)

  function toggleAgent(agentId: string): void {
    setAgentIds(
      selectedAgentIds.includes(agentId)
        ? selectedAgentIds.filter((id) => id !== agentId)
        : [...selectedAgentIds, agentId],
    )
  }

  async function browse(): Promise<void> {
    try {
      const result = await window.api.projects.pickPath()
      if (result.path) setPath(result.path)
    } catch (caught) {
      setError(toErrorMessage(caught))
    }
  }

  async function submit(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: trimmed,
        description: description.trim() || null,
        path: path.trim() || null,
        metadata: toMetadata(pairs),
      }
      const result = project
        ? await updateProject(project.id, payload)
        : await createProject(payload)

      if (!project) {
        setActiveProject(result.id)
        // Die Zuordnung darf das gespeicherte Projekt nicht mehr kippen — nur melden.
        const chosen = allAgents
          .filter((agent) => selectedAgentIds.includes(agent.id))
          .map((agent) => agent.id)
        if (chosen.length > 0) {
          try {
            await addManyToProject(result.id, chosen)
          } catch (caught) {
            setError(t('projectForm.agentsAssignFailed', { error: toErrorMessage(caught) }))
            return
          }
        }
      }

      // Ein fehlender Ordner blockiert das Speichern nicht — er wird nur angezeigt.
      if (result.pathWarning) {
        setPathWarning(result.pathWarning)
        return
      }
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
      title={project ? t('projectForm.title.edit') : t('projectForm.title.create')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{pathWarning ? t('common.close') : t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}

        <Input
          label={t('projectForm.name')}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('projectForm.namePlaceholder')}
        />

        <Textarea
          label={t('projectForm.description')}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('projectForm.descriptionPlaceholder')}
        />

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-muted">{t('projectForm.path')}</span>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="/Users/…/repo"
                className="font-mono"
              />
            </div>
            <Button
              className="shrink-0"
              icon={<FolderIcon width={16} height={16} />}
              onClick={() => void browse()}
            >
              {t('projectForm.browse')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-faint">{t('projectForm.pathHint')}</p>
          {pathWarning && (
            <p className="mt-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
              {t('projectForm.pathWarningSaved', { warning: pathWarning })}
            </p>
          )}
        </div>

        {!project && (
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-muted">{t('projectForm.agents')}</span>
            {allAgents.length === 0 ? (
              <div className="rounded-md border border-line bg-base px-2 py-2">
                <p className="text-xs text-ink-faint">{t('projectForm.noAgents')}</p>
                <Button
                  size="sm"
                  className="mt-1.5"
                  onClick={() => {
                    onClose()
                    openAgents('editor')
                  }}
                >
                  {t('projectForm.toAgents')}
                </Button>
              </div>
            ) : (
              <>
                <ul className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-line bg-base p-1">
                  {allAgents.map((agent) => (
                    <li key={agent.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-raised">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0 accent-accent"
                          checked={selectedAgentIds.includes(agent.id)}
                          onChange={() => toggleAgent(agent.id)}
                        />
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: agent.color }}
                        />
                        <span className="truncate text-sm text-ink">{agent.name}</span>
                        <Badge>{t(roleLabelKey(agent.role))}</Badge>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">
                          {agent.mentionKey}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-ink-faint">{t('projectForm.agentsHint')}</p>
              </>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">{t('projectForm.metadata')}</span>
            <Button
              size="sm"
              icon={<PlusIcon width={14} height={14} />}
              onClick={() => setPairs((current) => [...current, { key: '', value: '' }])}
            >
              {t('projectForm.addField')}
            </Button>
          </div>
          {pairs.length === 0 ? (
            <p className="text-xs text-ink-faint">
              {t('projectForm.metadataHint')} <code className="font-mono">test_url</code>,{' '}
              <code className="font-mono">tech_stack</code>.
            </p>
          ) : (
            <div className="space-y-2">
              {pairs.map((pair, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-44 shrink-0">
                    <Input
                      value={pair.key}
                      placeholder={t('projectForm.key')}
                      className="font-mono"
                      onChange={(event) =>
                        setPairs((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, key: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Input
                      value={pair.value}
                      placeholder={t('projectForm.value')}
                      onChange={(event) =>
                        setPairs((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, value: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <IconButton
                    label={t('projectForm.removeField')}
                    icon={<CloseIcon width={16} height={16} />}
                    onClick={() =>
                      setPairs((current) => current.filter((_, position) => position !== index))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

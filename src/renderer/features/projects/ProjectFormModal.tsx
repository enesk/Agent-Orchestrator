import { useEffect, useState } from 'react'
import type { JsonObject, Project } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { Button, IconButton, Input, Modal, Textarea } from '../../ui'
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
  const createProject = useProjectStore((state) => state.create)
  const updateProject = useProjectStore((state) => state.update)
  const setActiveProject = useUiStore((state) => state.setActiveProject)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [path, setPath] = useState('')
  const [pairs, setPairs] = useState<MetadataPair[]>([])
  const [pathWarning, setPathWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setPath(project?.path ?? '')
    setPairs(project ? toPairs(project.metadata) : [])
    setPathWarning(null)
    setError(null)
    setSaving(false)
  }, [open, project])

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

      if (!project) setActiveProject(result.id)

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
      title={project ? 'Projekt bearbeiten' : 'Neues Projekt'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{pathWarning ? 'Schließen' : 'Abbrechen'}</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
            Speichern
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
          label="Name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="z.B. Onlineshop"
        />

        <Textarea
          label="Beschreibung"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Worum geht es in diesem Projekt?"
        />

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-muted">Projektpfad</span>
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
              Durchsuchen
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            Die Agenten arbeiten in diesem Ordner — er ist das Arbeitsverzeichnis der Claude-CLI.
          </p>
          {pathWarning && (
            <p className="mt-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
              {pathWarning} Gespeichert wurde trotzdem.
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Metadaten</span>
            <Button
              size="sm"
              icon={<PlusIcon width={14} height={14} />}
              onClick={() => setPairs((current) => [...current, { key: '', value: '' }])}
            >
              Feld
            </Button>
          </div>
          {pairs.length === 0 ? (
            <p className="text-xs text-ink-faint">
              Freie Schlüssel/Wert-Paare, z.B. <code className="font-mono">test_url</code> oder{' '}
              <code className="font-mono">tech_stack</code>.
            </p>
          ) : (
            <div className="space-y-2">
              {pairs.map((pair, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-44 shrink-0">
                    <Input
                      value={pair.key}
                      placeholder="Schlüssel"
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
                      placeholder="Wert"
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
                    label="Feld entfernen"
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

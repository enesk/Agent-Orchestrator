import { useEffect, useState, type ClipboardEvent, type DragEvent } from 'react'
import { TICKET_CATEGORIES, type TicketCategory } from '@shared/constants'
import type { ProjectAgent } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { useTicketStore } from '../../store/ticketStore'
import { Button, Input, Modal, Select, Textarea } from '../../ui'
import { readFileAsBase64 } from './ticketHelpers'

const CATEGORY_OPTIONS = TICKET_CATEGORIES.map((option) => ({
  value: option.value,
  label: option.label,
}))

interface PendingImage {
  file: File
  previewUrl: string
}

export interface CreateTicketModalProps {
  open: boolean
  projectId: string
  agents: ProjectAgent[]
  onClose: () => void
}

export function CreateTicketModal({ open, projectId, agents, onClose }: CreateTicketModalProps) {
  const create = useTicketStore((state) => state.create)
  const select = useTicketStore((state) => state.select)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TicketCategory>('task')
  const [assignedAgentId, setAssignedAgentId] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setTitle('')
    setDescription('')
    setCategory('task')
    setAssignedAgentId('')
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      return []
    })
    setSaving(false)
    setError(null)
  }, [open])

  function addFiles(files: FileList | File[]): void {
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (accepted.length === 0) return
    setImages((current) => [
      ...current,
      ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ])
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>): void {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) addFiles(files)
  }

  async function submit(): Promise<void> {
    const trimmed = title.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const ticket = await create({
        projectId,
        title: trimmed,
        description: description.trim() || null,
        category,
        assignedAgentId: assignedAgentId || null,
      })

      for (const image of images) {
        await window.api.chat.saveAttachment({
          fileName: image.file.name || 'bild.png',
          mimeType: image.file.type || null,
          dataBase64: await readFileAsBase64(image.file),
          ticketId: ticket.id,
        })
      }

      await select(ticket.id)
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
      title="Neues Ticket"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} disabled={!title.trim()} onClick={() => void submit()}>
            Anlegen
          </Button>
        </>
      }
    >
      <div className="space-y-3" onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onPaste={onPaste}>
        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}

        <Input
          label="Titel"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Kurz und eindeutig"
        />

        <Textarea
          label="Beschreibung"
          rows={8}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Markdown wird unterstützt."
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Kategorie"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(event) => setCategory(event.target.value as TicketCategory)}
          />
          <Select
            label="Zuweisung"
            options={[
              { value: '', label: 'Nicht zugewiesen' },
              ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
            ]}
            value={assignedAgentId}
            onChange={(event) => setAssignedAgentId(event.target.value)}
          />
        </div>

        <div className="rounded-md border border-dashed border-line p-3">
          <p className="text-xs text-ink-faint">
            Bilder hierher ziehen oder einfügen — sie hängen anschließend am Ticket.
          </p>
          {images.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {images.map((image, index) => (
                <div key={image.previewUrl} className="relative">
                  <img
                    src={image.previewUrl}
                    alt={image.file.name}
                    className="h-16 w-full rounded border border-line object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Bild entfernen"
                    className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[11px] text-ink"
                    onClick={() =>
                      setImages((current) => {
                        URL.revokeObjectURL(image.previewUrl)
                        return current.filter((_, position) => position !== index)
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import { ATTACHMENT_ACCEPT, TICKET_CATEGORIES, type TicketCategory } from '@shared/constants'
import type { ProjectAgent } from '@shared/types'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useTicketStore } from '../../store/ticketStore'
import { Button, IconButton, Input, Modal, Select, Textarea } from '../../ui'
import { PaperclipIcon } from '../../ui/icons'
import {
  AttachmentTile,
  attachmentFileName,
  attachmentKind,
  selectAttachableFiles,
} from '../attachments'
import { categoryLabelKey, readFileAsBase64 } from './ticketHelpers'

interface PendingFile {
  file: File
  name: string
  /** Nur Bilder bekommen eine Vorschau-Adresse; sie wird beim Entfernen wieder freigegeben. */
  previewUrl: string | null
}

function revokePreview(pending: PendingFile): void {
  if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl)
}

export interface CreateTicketModalProps {
  open: boolean
  projectId: string
  agents: ProjectAgent[]
  onClose: () => void
}

export function CreateTicketModal({ open, projectId, agents, onClose }: CreateTicketModalProps) {
  const t = useT()
  const categoryOptions = useMemo(
    () =>
      TICKET_CATEGORIES.map((option) => ({
        value: option.value,
        label: t(categoryLabelKey(option.value)),
      })),
    [t],
  )
  const create = useTicketStore((state) => state.create)
  const select = useTicketStore((state) => state.select)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TicketCategory>('task')
  const [assignedAgentId, setAssignedAgentId] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setTitle('')
    setDescription('')
    setCategory('task')
    setAssignedAgentId('')
    setFiles((current) => {
      current.forEach(revokePreview)
      return []
    })
    setSaving(false)
    setError(null)
  }, [open])

  function addFiles(incoming: FileList | File[]): void {
    const { accepted, error: rejection } = selectAttachableFiles(Array.from(incoming), t)
    setError(rejection)
    if (accepted.length === 0) return
    setFiles((current) => [
      ...current,
      ...accepted.map((file) => {
        const name = attachmentFileName(file)
        return {
          file,
          name,
          previewUrl:
            attachmentKind(name, file.type || null) === 'image' ? URL.createObjectURL(file) : null,
        }
      }),
    ])
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>): void {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (chosen.length > 0) addFiles(chosen)
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>): void {
    const pasted = Array.from(event.clipboardData.files)
    if (pasted.length > 0) addFiles(pasted)
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

      for (const pending of files) {
        await window.api.chat.saveAttachment({
          fileName: pending.name,
          mimeType: pending.file.type || null,
          dataBase64: await readFileAsBase64(pending.file),
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
      title={t('ticketCreate.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!title.trim()} onClick={() => void submit()}>
            {t('common.create')}
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
          label={t('ticketCreate.ticketTitle')}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('ticketCreate.titlePlaceholder')}
        />

        <Textarea
          label={t('ticketCreate.description')}
          rows={8}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('ticketCreate.descriptionPlaceholder')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('ticketCreate.category')}
            options={categoryOptions}
            value={category}
            onChange={(event) => setCategory(event.target.value as TicketCategory)}
          />
          <Select
            label={t('ticketCreate.assignee')}
            options={[
              { value: '', label: t('ticket.card.unassigned') },
              ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
            ]}
            value={assignedAgentId}
            onChange={(event) => setAssignedAgentId(event.target.value)}
          />
        </div>

        <div className="rounded-md border border-dashed border-line p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-ink-faint">{t('ticketCreate.dropHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={pickFiles}
            />
            <IconButton
              label={t('attachment.attach')}
              icon={<PaperclipIcon />}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((pending, index) => (
                <AttachmentTile
                  key={`${pending.name}-${index}`}
                  fileName={pending.name}
                  size={pending.file.size}
                  kind={attachmentKind(pending.name, pending.file.type || null)}
                  previewUrl={pending.previewUrl}
                  onRemove={() =>
                    setFiles((current) => {
                      revokePreview(pending)
                      return current.filter((_, position) => position !== index)
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

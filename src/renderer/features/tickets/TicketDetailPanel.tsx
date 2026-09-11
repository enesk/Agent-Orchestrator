import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import {
  ATTACHMENT_ACCEPT,
  TICKET_CATEGORIES,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketStatus,
} from '@shared/constants'
import type { MessageAttachment, ProjectAgent, Ticket, TicketDetail } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useTicketStore } from '../../store/ticketStore'
import {
  Badge,
  Button,
  IconButton,
  Input,
  Markdown,
  Select,
  Spinner,
  Textarea,
  useConfirm,
} from '../../ui'
import { CloseIcon, PaperclipIcon } from '../../ui/icons'
import { AttachmentList, attachmentFileName, selectAttachableFiles } from '../attachments'
import { categoryLabelKey, categoryOption, readFileAsBase64, statusLabelKey } from './ticketHelpers'

export interface TicketDetailPanelProps {
  detail: TicketDetail
  tickets: Ticket[]
  agents: ProjectAgent[]
  onClose: () => void
}

export function TicketDetailPanel({ detail, tickets, agents, onClose }: TicketDetailPanelProps) {
  const t = useT()
  const format = useFormat()

  const statusOptions = useMemo(
    () =>
      (Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((status) => ({
        value: status,
        label: t(statusLabelKey(status)),
      })),
    [t],
  )
  const categoryOptions = useMemo(
    () =>
      TICKET_CATEGORIES.map((option) => ({
        value: option.value,
        label: t(categoryLabelKey(option.value)),
      })),
    [t],
  )

  const update = useTicketStore((state) => state.update)
  const addComment = useTicketStore((state) => state.addComment)
  const attachFile = useTicketStore((state) => state.attachFile)
  const removeAttachment = useTicketStore((state) => state.removeAttachment)
  const setDependencies = useTicketStore((state) => state.setDependencies)
  const { confirm, dialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(detail.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [description, setDescription] = useState(detail.description ?? '')
  const [editingDescription, setEditingDescription] = useState(false)
  const [comment, setComment] = useState('')
  const [dependencyQuery, setDependencyQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTitle(detail.title)
    setDescription(detail.description ?? '')
    setEditingTitle(false)
    setEditingDescription(false)
    setComment('')
    setDependencyQuery('')
    setError(null)
  }, [detail.id, detail.title, detail.description])

  const ticketById = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets])
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  const dependencyMatches = useMemo(() => {
    const query = dependencyQuery.trim().toLowerCase()
    if (!query) return []
    return tickets
      .filter(
        (ticket) =>
          ticket.id !== detail.id &&
          !detail.dependencies.includes(ticket.id) &&
          (ticket.title.toLowerCase().includes(query) || String(ticket.number).includes(query)),
      )
      .slice(0, 6)
  }, [dependencyQuery, tickets, detail.id, detail.dependencies])

  /** Ziehen, Einfügen und Büroklammer landen alle hier — Prüfung und Meldung wie im Chat. */
  function addFiles(incoming: FileList | File[]): void {
    const { accepted, error: rejection } = selectAttachableFiles(Array.from(incoming), t)
    setError(rejection)
    if (accepted.length === 0) return
    void run(async () => {
      for (const file of accepted) {
        await attachFile(detail.id, {
          fileName: attachmentFileName(file),
          mimeType: file.type || null,
          dataBase64: await readFileAsBase64(file),
        })
      }
      // Eine abgelehnte Datei aus derselben Auswahl darf ihre Meldung behalten.
      setError(rejection)
    })
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>): void {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (chosen.length > 0) addFiles(chosen)
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault()
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files)
  }

  function onPaste(event: ClipboardEvent<HTMLElement>): void {
    const pasted = Array.from(event.clipboardData.files)
    if (pasted.length > 0) addFiles(pasted)
  }

  async function confirmRemoveAttachment(attachment: MessageAttachment): Promise<void> {
    const confirmed = await confirm({
      title: t('ticketDetail.removeAttachmentTitle'),
      message: t('ticketDetail.removeAttachmentMessage', { name: attachment.fileName }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    await run(() => removeAttachment(detail.id, attachment.id))
  }

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const category = categoryOption(detail.category)

  return (
    <aside
      className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
      onPaste={onPaste}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-xs text-ink-faint">#{detail.number}</span>
          <Badge color={category.color}>{t(categoryLabelKey(detail.category))}</Badge>
        </div>
        <IconButton label={t('ticketDetail.close')} icon={<CloseIcon />} onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}

        {editingTitle ? (
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              setEditingTitle(false)
              const next = title.trim()
              if (!next || next === detail.title) {
                setTitle(detail.title)
                return
              }
              void run(() => update(detail.id, { title: next }))
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setTitle(detail.title)
                setEditingTitle(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="w-full rounded px-1 py-0.5 text-left text-sm font-medium text-ink hover:bg-raised"
          >
            {detail.title}
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Select
            label={t('ticketDetail.status')}
            options={statusOptions}
            value={detail.status}
            disabled={busy}
            onChange={(event) =>
              void run(() => update(detail.id, { status: event.target.value as TicketStatus }))
            }
          />
          <Select
            label={t('ticketCreate.category')}
            options={categoryOptions}
            value={detail.category}
            disabled={busy}
            onChange={(event) =>
              void run(() => update(detail.id, { category: event.target.value as TicketCategory }))
            }
          />
        </div>

        <Select
          label={t('ticketCreate.assignee')}
          options={[
            { value: '', label: t('ticket.card.unassigned') },
            ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
          ]}
          value={detail.assignedAgentId ?? ''}
          disabled={busy}
          onChange={(event) =>
            void run(() => update(detail.id, { assignedAgentId: event.target.value || null }))
          }
        />

        <section>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">{t('ticketCreate.description')}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (editingDescription) {
                  setEditingDescription(false)
                  if (description !== (detail.description ?? '')) {
                    void run(() => update(detail.id, { description: description || null }))
                  }
                } else {
                  setEditingDescription(true)
                }
              }}
            >
              {editingDescription ? t('ticketDetail.done') : t('common.edit')}
            </Button>
          </div>
          {editingDescription ? (
            <Textarea
              rows={10}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('ticketCreate.descriptionPlaceholder')}
            />
          ) : detail.description ? (
            <Markdown content={detail.description} />
          ) : (
            <p className="text-xs text-ink-faint">{t('project.card.noDescription')}</p>
          )}
        </section>

        <section>
          <span className="mb-1 block text-xs font-medium text-ink-muted">
            {t('ticketDetail.dependencies')}
          </span>
          {detail.dependencies.length === 0 && (
            <p className="text-xs text-ink-faint">{t('ticketDetail.noDependencies')}</p>
          )}
          <ul className="space-y-1">
            {detail.dependencies.map((dependencyId) => {
              const dependency = ticketById.get(dependencyId)
              return (
                <li
                  key={dependencyId}
                  className="flex items-center gap-2 rounded border border-line px-2 py-1 text-xs text-ink"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {dependency ? `#${dependency.number} ${dependency.title}` : dependencyId}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-ink-faint hover:text-danger disabled:opacity-50"
                    onClick={() =>
                      void run(() =>
                        setDependencies(
                          detail.id,
                          detail.dependencies.filter((id) => id !== dependencyId),
                        ),
                      )
                    }
                  >
                    {t('ticketDetail.removeDependency')}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-1.5">
            <Input
              placeholder={t('ticketDetail.searchTicket')}
              value={dependencyQuery}
              onChange={(event) => setDependencyQuery(event.target.value)}
            />
            {dependencyMatches.length > 0 && (
              <ul className="mt-1 space-y-1">
                {dependencyMatches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full truncate rounded px-2 py-1 text-left text-xs text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-50"
                      onClick={() =>
                        void run(async () => {
                          await setDependencies(detail.id, [...detail.dependencies, match.id])
                          setDependencyQuery('')
                        })
                      }
                    >
                      #{match.number} {match.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">{t('ticketDetail.attachments')}</span>
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
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          {detail.attachments.length === 0 ? (
            <p className="text-xs text-ink-faint">{t('ticketDetail.noAttachments')}</p>
          ) : (
            <AttachmentList
              attachments={detail.attachments}
              onRemove={(attachment) => void confirmRemoveAttachment(attachment)}
            />
          )}
          <p className="mt-1 text-[11px] text-ink-faint">{t('ticketDetail.attachmentsHint')}</p>
        </section>

        <section>
          <span className="mb-1 block text-xs font-medium text-ink-muted">
            {t('ticketDetail.comments', { count: detail.comments.length })}
          </span>
          <ul className="space-y-2">
            {detail.comments.map((entry) => (
              <li key={entry.id} className="rounded-md border border-line bg-raised p-2">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-faint">
                  <span className="text-ink-muted">
                    {entry.authorType === 'agent'
                      ? (entry.agentId && agentById.get(entry.agentId)?.name) ??
                        t('ticketDetail.authorAgent')
                      : t('ticketDetail.authorUser')}
                  </span>
                  <span>{format.dateTime(entry.createdAt)}</span>
                </div>
                <Markdown content={entry.content} className="text-xs" />
              </li>
            ))}
            {detail.comments.length === 0 && (
              <li className="text-xs text-ink-faint">{t('ticketDetail.noComments')}</li>
            )}
          </ul>
        </section>
      </div>

      <footer className="shrink-0 space-y-2 border-t border-line p-3">
        <Textarea
          rows={3}
          value={comment}
          placeholder={t('ticketDetail.commentPlaceholder')}
          onChange={(event) => setComment(event.target.value)}
        />
        <div className="flex items-center justify-end gap-2">
          {busy && <Spinner size={14} />}
          <Button
            variant="primary"
            size="sm"
            disabled={!comment.trim() || busy}
            onClick={() =>
              void run(async () => {
                await addComment(detail.id, comment.trim())
                setComment('')
              })
            }
          >
            {t('ticketDetail.comment')}
          </Button>
        </div>
      </footer>

      {dialog}
    </aside>
  )
}

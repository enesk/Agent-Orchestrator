import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import type { ProjectAgent, Ticket } from '@shared/types'
import { toErrorMessage } from '../../store/errorMessage'
import { useGoalStore } from '../../store/goalStore'
import { Button, Input, Textarea, cn } from '../../ui'
import { CloseIcon } from '../../ui/icons'
import { AgentPicker } from './AgentPicker'

/** Nur Klartext wird an die Beschreibung angehängt — alles andere wäre für den Prompt nutzlos. */
const ACCEPTED_EXTENSIONS = ['.md', '.txt', '.markdown']

interface AttachedText {
  name: string
  content: string
}

type Mode = 'description' | 'tickets'

export interface NewGoalViewProps {
  projectId: string
  agents: ProjectAgent[]
  tickets: Ticket[]
  /** Vom Ticket-Board vorgemerkte Tickets; ist die Liste leer, gibt es nur den Textweg. */
  draftTicketIds: string[]
  onClose: () => void
}

export function NewGoalView({
  projectId,
  agents,
  tickets,
  draftTicketIds,
  onClose,
}: NewGoalViewProps) {
  const startFromDescription = useGoalStore((state) => state.startFromDescription)
  const startFromTickets = useGoalStore((state) => state.startFromTickets)
  const setDraftTickets = useGoalStore((state) => state.setDraftTickets)

  const [mode, setMode] = useState<Mode>(draftTicketIds.length > 0 ? 'tickets' : 'description')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<AttachedText[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Vorausgewählt ist, wer die Rolle „Umsetzung" hat.
  useEffect(() => {
    setSelectedAgentIds(agents.filter((agent) => agent.role === 'worker').map((agent) => agent.id))
  }, [agents])

  useEffect(() => {
    if (draftTicketIds.length === 0 && mode === 'tickets') setMode('description')
  }, [draftTicketIds, mode])

  const draftTickets = useMemo(
    () => draftTicketIds.map((id) => tickets.find((ticket) => ticket.id === id)).filter(isTicket),
    [draftTicketIds, tickets],
  )

  const composedDescription = useMemo(() => {
    const parts = [description.trim()]
    for (const file of files) parts.push(`## ${file.name}\n\n${file.content.trim()}`)
    return parts.filter(Boolean).join('\n\n')
  }, [description, files])

  async function addFiles(list: FileList | File[]): Promise<void> {
    const accepted = Array.from(list).filter((file) =>
      ACCEPTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension)),
    )
    if (accepted.length === 0) return
    const read = await Promise.all(
      accepted.map(async (file) => ({ name: file.name, content: await file.text() })),
    )
    setFiles((current) => [...current, ...read])
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragOver(false)
    void addFiles(event.dataTransfer.files)
  }

  function onPick(event: ChangeEvent<HTMLInputElement>): void {
    const list = event.target.files
    event.target.value = ''
    if (list) void addFiles(list)
  }

  const canSubmit =
    mode === 'tickets' ? draftTickets.length > 0 : composedDescription.trim().length > 0

  async function submit(): Promise<void> {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const trimmedTitle = title.trim()
      if (mode === 'tickets') {
        await startFromTickets({
          projectId,
          ticketIds: draftTickets.map((ticket) => ticket.id),
          ...(trimmedTitle ? { title: trimmedTitle } : {}),
          selectedAgentIds,
        })
      } else {
        await startFromDescription({
          projectId,
          description: composedDescription,
          ...(trimmedTitle ? { title: trimmedTitle } : {}),
          selectedAgentIds,
        })
      }
      setDraftTickets([])
      onClose()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-sm font-medium text-ink">Neues Vorhaben</h2>
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          Starten
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-4 p-4">
          {error && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
              {error}
            </p>
          )}

          {draftTickets.length > 0 && (
            <div className="flex gap-1 rounded-md border border-line bg-surface p-1">
              <ModeTab active={mode === 'tickets'} onClick={() => setMode('tickets')}>
                Aus Tickets
              </ModeTab>
              <ModeTab active={mode === 'description'} onClick={() => setMode('description')}>
                Aus Beschreibung
              </ModeTab>
            </div>
          )}

          <Input
            label="Titel (optional)"
            value={title}
            placeholder="Wird sonst aus der Beschreibung abgeleitet"
            onChange={(event) => setTitle(event.target.value)}
          />

          {mode === 'tickets' ? (
            <section>
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {draftTickets.length} Tickets werden abgearbeitet
              </p>
              <ul className="space-y-1">
                {draftTickets.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                      #{ticket.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{ticket.title}</span>
                    <button
                      type="button"
                      aria-label="Ticket entfernen"
                      className="shrink-0 text-ink-faint transition-colors hover:text-ink"
                      onClick={() =>
                        setDraftTickets(draftTicketIds.filter((id) => id !== ticket.id))
                      }
                    >
                      <CloseIcon width={14} height={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <Textarea
                label="Beschreibung"
                rows={12}
                autoFocus
                value={description}
                placeholder="Was soll entstehen? Je genauer, desto besser wird das Pflichtenheft."
                onChange={(event) => setDescription(event.target.value)}
              />

              <div
                onDrop={onDrop}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                className={cn(
                  'rounded-md border border-dashed p-3 transition-colors',
                  dragOver ? 'border-accent bg-accent-soft' : 'border-line',
                )}
              >
                <div className="flex items-center gap-3">
                  <label className="inline-flex h-7 cursor-pointer items-center rounded-md border border-line bg-raised px-2.5 text-xs text-ink hover:bg-overlay">
                    Dateien wählen
                    <input
                      type="file"
                      multiple
                      accept=".md,.markdown,.txt,text/markdown,text/plain"
                      className="hidden"
                      onChange={onPick}
                    />
                  </label>
                  <p className="text-xs text-ink-faint">
                    Oder .md/.txt hierher ziehen — der Inhalt wird unter dem Dateinamen angehängt.
                  </p>
                </div>

                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">
                          {file.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-faint">
                          {file.content.length} Zeichen
                        </span>
                        <button
                          type="button"
                          aria-label="Datei entfernen"
                          className="shrink-0 text-ink-faint transition-colors hover:text-ink"
                          onClick={() =>
                            setFiles((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                        >
                          <CloseIcon width={14} height={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <section>
            <p className="mb-1 text-xs font-medium text-ink-muted">Eingesetzte Agenten</p>
            <AgentPicker
              agents={agents}
              selectedIds={selectedAgentIds}
              onChange={setSelectedAgentIds}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function isTicket(ticket: Ticket | undefined): ticket is Ticket {
  return !!ticket
}

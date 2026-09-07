import { useEffect, useMemo, useState } from 'react'
import { useAgentStore } from '../../store/agentStore'
import { useDocumentStore } from '../../store/documentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Input, Modal, Spinner, cn, formatDateTime } from '../../ui'
import { DocumentIcon, PlusIcon } from '../../ui/icons'
import { DocumentEditor } from './DocumentEditor'

export function DocumentsView() {
  const projectId = useUiStore((state) => state.activeProjectId)

  const documents = useDocumentStore((state) => state.documents)
  const selectedId = useDocumentStore((state) => state.selectedId)
  const loading = useDocumentStore((state) => state.loading)
  const storeError = useDocumentStore((state) => state.error)
  const loadDocuments = useDocumentStore((state) => state.load)
  const selectDocument = useDocumentStore((state) => state.select)
  const createDocument = useDocumentStore((state) => state.create)
  const updateDocument = useDocumentStore((state) => state.update)
  const removeDocument = useDocumentStore((state) => state.remove)
  const subscribeDocuments = useDocumentStore((state) => state.subscribe)

  const agents = useAgentStore((state) => state.agents)
  const loadAgents = useAgentStore((state) => state.load)

  const [titleDraft, setTitleDraft] = useState('')
  const [dialog, setDialog] = useState<'create' | 'rename' | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void loadDocuments(projectId)
    void loadAgents(projectId)
  }, [projectId, loadDocuments, loadAgents])

  useEffect(() => subscribeDocuments(), [subscribeDocuments])

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])
  const selected = documents.find((document) => document.id === selectedId) ?? null

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setDialog(null)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove(): Promise<void> {
    if (!selected) return
    if (!window.confirm(`Dokument „${selected.title}" löschen?`)) return
    await run(() => removeDocument(selected.id))
  }

  if (!projectId) {
    return (
      <EmptyState
        title="Kein Projekt ausgewählt"
        description="Wähle links ein Projekt, um dessen Dokumente zu sehen."
        icon={<DocumentIcon />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
          <span className="text-sm font-medium text-ink">Dokumente</span>
          {loading && <Spinner size={14} />}
          <Button
            size="sm"
            variant="primary"
            icon={<PlusIcon width={14} height={14} />}
            onClick={() => {
              setTitleDraft('')
              setActionError(null)
              setDialog('create')
            }}
          >
            Neu
          </Button>
        </header>

        {(storeError || actionError) && (
          <p className="border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        <ul className="min-h-0 flex-1 overflow-auto p-2">
          {!loading && documents.length === 0 && (
            <li className="px-1 py-4 text-center text-xs text-ink-faint">Noch keine Dokumente</li>
          )}
          {documents.map((document) => {
            const author = document.updatedByAgentId ?? document.createdByAgentId
            const authorName = author ? agentById.get(author)?.name ?? 'Agent' : 'Du'
            return (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => selectDocument(document.id)}
                  className={cn(
                    'mb-1 w-full rounded-md px-2 py-1.5 text-left transition-colors',
                    document.id === selectedId
                      ? 'bg-accent-soft text-ink'
                      : 'text-ink-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  <span className="block truncate text-xs font-medium">{document.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                    {authorName} · {formatDateTime(document.updatedAt)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {selected ? (
        <DocumentEditor
          document={selected}
          agents={agentById}
          onRename={() => {
            setTitleDraft(selected.title)
            setActionError(null)
            setDialog('rename')
          }}
          onDelete={() => void remove()}
        />
      ) : (
        <EmptyState
          title="Kein Dokument ausgewählt"
          description="Wähle links ein Dokument oder lege ein neues an."
          icon={<DocumentIcon />}
          className="flex-1"
        />
      )}

      <Modal
        open={dialog !== null}
        title={dialog === 'rename' ? 'Dokument umbenennen' : 'Neues Dokument'}
        width="sm"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Abbrechen</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!titleDraft.trim()}
              onClick={() =>
                void run(() =>
                  dialog === 'rename' && selected
                    ? updateDocument(selected.id, { title: titleDraft.trim() })
                    : createDocument(projectId, titleDraft.trim()),
                )
              }
            >
              {dialog === 'rename' ? 'Umbenennen' : 'Anlegen'}
            </Button>
          </>
        }
      >
        <Input
          label="Titel"
          autoFocus
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          placeholder="z.B. Pflichtenheft"
        />
        {actionError && <p className="mt-2 text-xs text-danger">{actionError}</p>}
      </Modal>
    </div>
  )
}

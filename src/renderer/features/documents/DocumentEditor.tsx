import { useEffect, useRef, useState } from 'react'
import type { ProjectAgent, ProjectDocument } from '@shared/types'
import type { TranslationKey } from '@shared/i18n'
import { useFormat, useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useDocumentStore } from '../../store/documentStore'
import { Button, Markdown, Spinner, cn } from '../../ui'

const AUTOSAVE_DELAY = 800

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const SAVE_LABEL_KEYS: Record<Exclude<SaveState, 'idle'>, TranslationKey> = {
  pending: 'documents.save.pending',
  saving: 'documents.save.saving',
  saved: 'common.saved',
  error: 'documents.save.pending',
}

export interface DocumentEditorProps {
  document: ProjectDocument
  agents: Map<string, ProjectAgent>
  onRename: () => void
  onDelete: () => void
}

export function DocumentEditor({ document, agents, onRename, onDelete }: DocumentEditorProps) {
  const t = useT()
  const format = useFormat()
  const update = useDocumentStore((state) => state.update)

  const [draft, setDraft] = useState(document.content)
  const [preview, setPreview] = useState(false)
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  /** Zuletzt gespeicherter Text — trennt eigene Speicherungen von fremden Änderungen. */
  const savedRef = useRef(document.content)

  useEffect(() => {
    setDraft(document.content)
    savedRef.current = document.content
    setState('idle')
    setError(null)
  }, [document.id])

  // Änderungen eines Agenten übernehmen, solange nichts Eigenes offen ist.
  useEffect(() => {
    if (document.content === savedRef.current) return
    setDraft((current) => {
      if (current !== savedRef.current) return current
      savedRef.current = document.content
      return document.content
    })
  }, [document.content])

  useEffect(() => {
    if (draft === savedRef.current) return
    setState('pending')
    const timer = window.setTimeout(() => {
      const content = draft
      setState('saving')
      update(document.id, { content })
        .then(() => {
          savedRef.current = content
          setState('saved')
          setError(null)
        })
        .catch((caught: unknown) => {
          setState('error')
          setError(toErrorMessage(caught))
        })
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [draft, document.id, update])

  const author = document.updatedByAgentId ?? document.createdByAgentId
  const authorName = author ? agents.get(author)?.name ?? t('documents.author.agent') : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{document.title}</h2>
        <span className="shrink-0 text-[11px] text-ink-faint">
          {authorName ? `${t('documents.byAuthor', { name: authorName })} · ` : ''}
          {format.dateTime(document.updatedAt)}
        </span>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-[11px]',
            state === 'error' ? 'text-danger' : 'text-ink-faint',
          )}
        >
          {state === 'saving' && <Spinner size={11} />}
          {state !== 'idle' && t(SAVE_LABEL_KEYS[state])}
        </span>
        <Button size="sm" onClick={() => setPreview((current) => !current)}>
          {preview ? t('common.edit') : t('documents.preview')}
        </Button>
        <Button size="sm" onClick={onRename}>
          {t('documents.rename.submit')}
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          {t('common.delete')}
        </Button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      {preview ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {draft.trim() ? (
            <Markdown content={draft} />
          ) : (
            <p className="text-xs text-ink-faint">{t('documents.emptyDocument')}</p>
          )}
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          placeholder={t('documents.editorPlaceholder')}
          className="min-h-0 flex-1 resize-none bg-base px-4 py-3 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />
      )}
    </div>
  )
}

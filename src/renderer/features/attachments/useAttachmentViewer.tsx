import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { MessageAttachment } from '@shared/types'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { Markdown, Modal, Spinner } from '../../ui'
import { attachmentUrl, kindOf } from './attachmentHelpers'

interface MarkdownView {
  attachment: MessageAttachment
  content: string | null
}

export interface AttachmentViewer {
  /** Öffnet den Anhang — Bild als Lightbox, Markdown im Modal, alles Übrige im System. */
  open: (attachment: MessageAttachment) => void
  /** Muss einmal im Baum gerendert werden; ohne offenen Anhang ist es nichts. */
  viewer: ReactNode
}

/**
 * HTML wird bewusst **nicht** in der App dargestellt: `attachment://` ist ein privilegiertes
 * Schema, fremdes HTML darin zu rendern würde Skripte aus einer Datei ausführen, die der
 * Nutzer nur prüfen lassen wollte. Dafür ist der Standardbrowser die richtige Grenze.
 */
export function useAttachmentViewer(): AttachmentViewer {
  const t = useT()
  const [image, setImage] = useState<MessageAttachment | null>(null)
  const [markdown, setMarkdown] = useState<MarkdownView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback((attachment: MessageAttachment) => {
    setError(null)
    const kind = kindOf(attachment)

    if (kind === 'image') {
      setImage(attachment)
      return
    }

    if (kind === 'markdown') {
      setMarkdown({ attachment, content: null })
      void fetch(attachmentUrl(attachment))
        .then((response) => {
          if (!response.ok) throw new Error(t('attachment.notReadable'))
          return response.text()
        })
        .then((content) => setMarkdown({ attachment, content }))
        .catch((caught: unknown) => {
          setMarkdown(null)
          setError(toErrorMessage(caught))
        })
      return
    }

    void window.api.attachments
      .open({ attachmentId: attachment.id })
      .catch((caught: unknown) => setError(toErrorMessage(caught)))
  }, [t])

  useEffect(() => {
    if (!image) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setImage(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [image])

  const viewer = (
    <>
      {image && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onMouseDown={() => setImage(null)}
        >
          <img
            src={attachmentUrl(image)}
            alt={image.fileName}
            className="max-h-full max-w-full rounded-md object-contain"
            onMouseDown={(event) => event.stopPropagation()}
          />
          <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">
            {t('attachment.escapeCloses', { name: image.fileName })}
          </p>
        </div>
      )}

      {markdown && (
        <Modal
          open
          width="lg"
          title={markdown.attachment.fileName}
          onClose={() => setMarkdown(null)}
        >
          {markdown.content === null ? (
            <Spinner size={18} className="text-ink-muted" />
          ) : (
            <Markdown content={markdown.content} />
          )}
        </Modal>
      )}

      {error && (
        <Modal open width="sm" title={t('attachment.openFailed')} onClose={() => setError(null)}>
          <p className="text-sm text-ink-muted">{error}</p>
        </Modal>
      )}
    </>
  )

  return { open, viewer }
}

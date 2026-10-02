import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { MessageAttachment } from '@shared/types'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, Markdown, Modal, Spinner } from '../../ui'
import { attachmentUrl, kindOf } from './attachmentHelpers'

/** Der geladene Inhalt einer Datei, die im Modal statt im Standardprogramm landet. */
interface ContentView {
  attachment: MessageAttachment
  /** `null`, solange der Abruf über `attachment://` läuft. */
  content: string | null
}

export interface AttachmentViewer {
  /**
   * Öffnet den Anhang — Bild als Lightbox, Markdown und Code im Modal, alles Übrige im
   * System.
   */
  open: (attachment: MessageAttachment) => void
  /** Muss einmal im Baum gerendert werden; ohne offenen Anhang ist es nichts. */
  viewer: ReactNode
}

/**
 * HTML wird bewusst **nicht** in der App dargestellt: `attachment://` ist ein privilegiertes
 * Schema, fremdes HTML darin zu rendern würde Skripte aus einer Datei ausführen, die der
 * Nutzer nur prüfen lassen wollte. Dafür ist der Standardbrowser die richtige Grenze.
 * Code-Dateien laufen dagegen durch den Textbetrachter: dort landet der Inhalt als Text in
 * einem `<pre>`, nie als Markup.
 */
export function useAttachmentViewer(): AttachmentViewer {
  const t = useT()
  const [image, setImage] = useState<MessageAttachment | null>(null)
  const [markdown, setMarkdown] = useState<ContentView | null>(null)
  const [text, setText] = useState<ContentView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openInSystem = useCallback((attachment: MessageAttachment) => {
    void window.api.attachments
      .open({ attachmentId: attachment.id })
      .catch((caught: unknown) => setError(toErrorMessage(caught)))
  }, [])

  const open = useCallback(
    (attachment: MessageAttachment) => {
      setError(null)
      const kind = kindOf(attachment)

      if (kind === 'image') {
        setImage(attachment)
        return
      }

      if (kind === 'markdown' || kind === 'code') {
        const show = kind === 'markdown' ? setMarkdown : setText
        show({ attachment, content: null })
        void fetch(attachmentUrl(attachment))
          .then((response) => {
            if (!response.ok) throw new Error(t('attachment.notReadable'))
            return response.text()
          })
          .then((content) => show({ attachment, content }))
          .catch((caught: unknown) => {
            show(null)
            setError(toErrorMessage(caught))
          })
        return
      }

      openInSystem(attachment)
    },
    [openInSystem, t],
  )

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

      {text && (
        <Modal
          open
          width="lg"
          title={text.attachment.fileName}
          onClose={() => setText(null)}
          footer={
            <Button
              size="sm"
              onClick={() => {
                openInSystem(text.attachment)
                setText(null)
              }}
            >
              {t('attachment.openInSystem')}
            </Button>
          }
        >
          {text.content === null ? (
            <Spinner size={18} className="text-ink-muted" />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
              {text.content}
            </pre>
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

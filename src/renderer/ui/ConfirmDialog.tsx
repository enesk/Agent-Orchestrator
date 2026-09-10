import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Button } from './Button'
import { Modal } from './Modal'

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Rote Bestätigungsschaltfläche für alles, was Daten entfernt oder Läufe abbricht. */
  danger?: boolean
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT()
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-muted">{message}</p>
    </Modal>
  )
}

/**
 * Ersatz für `window.confirm`, das in Electron den kompletten Renderer anhält.
 * Call sites bleiben fast unverändert (`if (!(await confirm({ … }))) return`); das
 * zurückgegebene `dialog` muss irgendwo im Baum gerendert werden.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  dialog: ReactNode
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    setOptions(null)
    resolveRef.current?.(value)
    resolveRef.current = null
  }, [])

  const confirm = useCallback((next: ConfirmOptions) => {
    // Eine bereits offene Abfrage gilt als abgelehnt, damit kein Aufrufer hängen bleibt.
    resolveRef.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const dialog = (
    <ConfirmDialog
      {...(options ?? { title: '', message: '' })}
      open={options !== null}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return { confirm, dialog }
}

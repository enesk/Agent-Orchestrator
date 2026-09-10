import { useEffect, type ReactNode } from 'react'
import { useT } from '../i18n'
import { cn } from './cn'
import { CloseIcon } from './icons'
import { IconButton } from './IconButton'

export interface ModalProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
} as const

export function Modal({ open, title, onClose, children, footer, width = 'md' }: ModalProps) {
  const t = useT()
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[85vh] w-full flex-col rounded-lg border border-line bg-surface shadow-2xl',
          WIDTHS[width],
        )}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <h2 className="truncate text-sm font-medium text-ink">{title}</h2>
          <IconButton label={t('common.close')} icon={<CloseIcon />} onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line p-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

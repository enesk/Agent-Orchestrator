import { useEffect, useMemo, useRef, useState } from 'react'
import type { TranslationKey } from '@shared/i18n'
import { useT } from '../../i18n'
import { cn } from '../../ui'
import { ChevronDownIcon } from '../../ui/icons'

/** `null` steht für „gesamten Verlauf", sonst die Altersgrenze in Tagen. */
export type ClearScope = number | null

interface ScopeOption {
  scope: ClearScope
  labelKey: TranslationKey
}

const OPTIONS: ScopeOption[] = [
  { scope: 7, labelKey: 'chat.history.olderThan7' },
  { scope: 30, labelKey: 'chat.history.olderThan30' },
  { scope: null, labelKey: 'chat.history.all' },
]

export interface HistoryMenuProps {
  busy: boolean
  onSelect: (scope: ClearScope) => void
}

export function HistoryMenu({ busy, onSelect }: HistoryMenuProps) {
  const t = useT()
  const options = useMemo(
    () => OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) })),
    [t],
  )
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent): void {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-line px-2 py-1',
          'text-xs text-ink-muted transition-colors hover:bg-raised hover:text-ink',
          'disabled:opacity-50',
        )}
      >
        {busy ? t('chat.history.cleaning') : t('chat.history.clean')}
        <ChevronDownIcon width={12} height={12} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md',
            'border border-line bg-overlay py-1 shadow-lg',
          )}
        >
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => {
                setOpen(false)
                onSelect(option.scope)
              }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-raised',
                option.scope === null ? 'text-danger' : 'text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

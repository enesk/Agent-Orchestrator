import { useState } from 'react'
import { cn } from '../../ui'
import { ChevronDownIcon, ChevronRightIcon } from '../../ui/icons'

export interface ThinkingBlockProps {
  thinking: string
}

/** Der Denkvorgang steht über der Antwort und ist standardmäßig zugeklappt. */
export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-colors',
          'text-ink-faint hover:bg-raised hover:text-ink-muted',
        )}
      >
        {open ? (
          <ChevronDownIcon width={12} height={12} />
        ) : (
          <ChevronRightIcon width={12} height={12} />
        )}
        Überlegt …
      </button>
      {open && (
        <pre className="mt-1 whitespace-pre-wrap rounded-md border border-line bg-raised px-2.5 py-2 font-sans text-xs italic leading-relaxed text-ink-muted">
          {thinking}
        </pre>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from './cn'

export interface PanelProps {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function Panel({ title, actions, children, className, bodyClassName }: PanelProps) {
  return (
    <section
      className={cn('flex min-h-0 flex-col rounded-lg border border-line bg-surface', className)}
    >
      {(title || actions) && (
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
          <h2 className="truncate text-sm font-medium text-ink">{title}</h2>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={cn('min-h-0 flex-1 overflow-auto p-3', bodyClassName)}>{children}</div>
    </section>
  )
}

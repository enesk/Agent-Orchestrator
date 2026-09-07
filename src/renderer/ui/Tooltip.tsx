import type { ReactNode } from 'react'
import { cn } from './cn'

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'

const SIDES: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
}

export interface TooltipProps {
  label: string
  side?: TooltipSide
  children: ReactNode
  className?: string
}

/** Reines CSS-Tooltip — erscheint bei Hover und Fokus, ohne Portal und ohne Bibliothek. */
export function Tooltip({ label, side = 'top', children, className }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded border border-line',
          'bg-overlay px-2 py-1 text-[11px] text-ink opacity-0 shadow-lg transition-opacity',
          'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          SIDES[side],
        )}
      >
        {label}
      </span>
    </span>
  )
}

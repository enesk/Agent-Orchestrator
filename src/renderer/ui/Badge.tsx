import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-muted border-line',
  accent: 'bg-accent-soft text-accent border-accent/40',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-info/10 text-info border-info/30',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  /** Freie Farbe, z.B. für Ticket-Kategorien aus den Konstanten. */
  color?: string
}

export function Badge({ tone = 'neutral', color, children, className }: BadgeProps) {
  return (
    <span
      style={color ? { color, borderColor: `${color}55`, backgroundColor: `${color}1a` } : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none',
        !color && TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

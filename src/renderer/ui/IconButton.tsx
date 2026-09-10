import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type IconButtonTone = 'default' | 'danger'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pflicht: der Knopf zeigt nur ein Symbol und braucht einen zugänglichen Namen. */
  label: string
  icon: ReactNode
  active?: boolean
  tone?: IconButtonTone
}

/**
 * `cn` fügt Klassen nur zusammen, es löst keine Konflikte auf — die Ruhe- und Hover-Farben
 * stehen deshalb je Tonlage einmal vollständig da, statt sie über `className` zu überschreiben.
 */
const TONES: Record<IconButtonTone, string> = {
  default: 'text-ink-muted hover:bg-raised hover:text-ink',
  danger: 'text-ink-muted hover:bg-danger/10 hover:text-danger',
}

export function IconButton({
  label,
  icon,
  active,
  tone = 'default',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-accent-soft text-accent' : TONES[tone],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}

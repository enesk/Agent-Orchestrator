import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pflicht: der Knopf zeigt nur ein Symbol und braucht einen zugänglichen Namen. */
  label: string
  icon: ReactNode
  active?: boolean
}

export function IconButton({ label, icon, active, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}

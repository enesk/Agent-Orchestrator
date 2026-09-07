import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
}

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const inputId = id ?? props.name
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>}
      <input
        id={inputId}
        className={cn(
          'h-9 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-faint',
          'transition-colors focus:border-accent focus:outline-none',
          error ? 'border-danger' : 'border-line',
          className,
        )}
        {...props}
      />
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      )}
    </label>
  )
}

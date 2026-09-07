import type { TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string | null
}

export function Textarea({ label, hint, error, className, id, ...props }: TextareaProps) {
  const textareaId = id ?? props.name
  return (
    <label className="block" htmlFor={textareaId}>
      {label && <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>}
      <textarea
        id={textareaId}
        className={cn(
          'w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm text-ink',
          'placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none',
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

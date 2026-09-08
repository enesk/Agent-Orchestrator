import { useEffect, useRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Teilauswahl — im DOM nur über die Property setzbar, nicht über ein Attribut. */
  indeterminate?: boolean
}

export function Checkbox({ indeterminate = false, className, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn('h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent', className)}
      {...props}
    />
  )
}

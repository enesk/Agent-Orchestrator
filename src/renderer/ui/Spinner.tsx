import { useT } from '../i18n'
import { cn } from './cn'

export interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  const t = useT()
  return (
    <span
      role="status"
      aria-label={t('common.loading')}
      style={{ width: size, height: size, borderWidth: Math.max(1.5, size / 9) }}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent opacity-70',
        className,
      )}
    />
  )
}

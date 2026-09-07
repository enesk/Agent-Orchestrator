import React from 'react'
import { useLanguage } from '../i18n'

interface Props {
  current: number
  min: number
  max?: number
  className?: string
}

export default function CharCounter({ current, min, max, className = '' }: Props) {
  const { t } = useLanguage()
  const belowMin = current < min
  const atMax = max !== undefined && current >= max

  const color = atMax
    ? 'text-status-error'
    : belowMin
      ? 'text-status-warning'
      : 'text-status-success'

  return (
    <span className={`text-xs font-medium tabular-nums transition-colors ${color} ${className}`}>
      {current} / {min} ({t('ui.counterMin')})
      {max !== undefined && <span className="text-txt-muted"> · {t('ui.counterMax')} {max}</span>}
    </span>
  )
}

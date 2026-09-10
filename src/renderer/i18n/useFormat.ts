import { useMemo } from 'react'
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatTime,
  formatTimeWithSeconds,
} from '@shared/i18n'
import { useLanguage } from './context'

export interface Formatters {
  dateTime: (value: string | number | Date) => string
  date: (value: string | number | Date) => string
  time: (value: string | number | Date) => string
  timeWithSeconds: (value: string | number | Date) => string
  relative: (value: string | number | Date) => string
  number: (value: number, options?: Intl.NumberFormatOptions) => string
  bytes: (value: number) => string
  duration: (ms: number) => string
}

/** Zahlen, Daten und Größen in der aktiven Sprache. Identität wechselt nur mit der Sprache. */
export function useFormat(): Formatters {
  const language = useLanguage()
  return useMemo<Formatters>(
    () => ({
      dateTime: (value) => formatDateTime(language, value),
      date: (value) => formatDate(language, value),
      time: (value) => formatTime(language, value),
      timeWithSeconds: (value) => formatTimeWithSeconds(language, value),
      relative: (value) => formatRelativeTime(language, value),
      number: (value, options) => formatNumber(language, value, options),
      bytes: (value) => formatBytes(language, value),
      duration: (ms) => formatDuration(language, ms),
    }),
    [language],
  )
}

import type { Language } from './types'

export const LOCALES: Record<Language, string> = {
  de: 'de-DE',
  en: 'en-US',
  tr: 'tr-TR',
}

/** Formatter sind teuer zu bauen und werden hier pro Sprache und Variante gemerkt. */
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>()

function dateTimeFormat(language: Language, key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `dt:${language}:${key}`
  let formatter = cache.get(id) as Intl.DateTimeFormat | undefined
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALES[language], options)
    cache.set(id, formatter)
  }
  return formatter
}

function numberFormat(language: Language, key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = `nu:${language}:${key}`
  let formatter = cache.get(id) as Intl.NumberFormat | undefined
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALES[language], options)
    cache.set(id, formatter)
  }
  return formatter
}

function relativeTimeFormat(language: Language): Intl.RelativeTimeFormat {
  const id = `rt:${language}`
  let formatter = cache.get(id) as Intl.RelativeTimeFormat | undefined
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(LOCALES[language], { numeric: 'auto' })
    cache.set(id, formatter)
  }
  return formatter
}

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(language: Language, value: string | number | Date): string {
  const date = toDate(value)
  if (!date) return String(value)
  return dateTimeFormat(language, 'dateTime', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDate(language: Language, value: string | number | Date): string {
  const date = toDate(value)
  if (!date) return String(value)
  return dateTimeFormat(language, 'date', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function formatTime(language: Language, value: string | number | Date): string {
  const date = toDate(value)
  if (!date) return String(value)
  return dateTimeFormat(language, 'time', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatTimeWithSeconds(language: Language, value: string | number | Date): string {
  const date = toDate(value)
  if (!date) return String(value)
  return dateTimeFormat(language, 'timeSec', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

/**
 * Kurzer Stempel für die letzte Aktivität: heute nur die Uhrzeit, im laufenden Jahr Tag und
 * Monat („31. Okt."), davor zusätzlich das Jahr.
 */
export function formatActivityStamp(
  language: Language,
  value: string | number | Date,
  now: number = Date.now(),
): string {
  const date = toDate(value)
  if (!date) return String(value)
  const today = new Date(now)
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) return formatTime(language, date)
  if (date.getFullYear() === today.getFullYear()) {
    return dateTimeFormat(language, 'dayMonth', { day: 'numeric', month: 'short' }).format(date)
  }
  return dateTimeFormat(language, 'dayMonthYear', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatNumber(language: Language, value: number, options: Intl.NumberFormatOptions = {}): string {
  const key = `${options.minimumFractionDigits ?? ''}/${options.maximumFractionDigits ?? ''}/${options.style ?? ''}`
  return numberFormat(language, key, options).format(value)
}

const RELATIVE_STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.348],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

/** „vor 3 Minuten" / „3 minutes ago" / „3 dakika önce" — ohne eigene Wortliste. */
export function formatRelativeTime(
  language: Language,
  value: string | number | Date,
  now: number = Date.now(),
): string {
  const date = toDate(value)
  if (!date) return String(value)
  let delta = (date.getTime() - now) / 1000
  for (const [unit, span] of RELATIVE_STEPS) {
    if (Math.abs(delta) < span || span === Number.POSITIVE_INFINITY) {
      return relativeTimeFormat(language).format(Math.round(delta), unit)
    }
    delta /= span
  }
  return relativeTimeFormat(language).format(Math.round(delta), 'year')
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** Dateigröße mit den Trennzeichen der aktiven Sprache — `12.4 KB` bzw. `12,4 KB`. */
export function formatBytes(language: Language, bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  const digits = unit === 0 || size >= 100 ? 0 : 1
  return `${formatNumber(language, size, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${BYTE_UNITS[unit]}`
}

/** Dauer in Millisekunden als kurze Angabe: `1,4 s`, `2:05 min`. */
export function formatDuration(language: Language, ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${formatNumber(language, Math.round(ms))} ms`
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${formatNumber(language, seconds, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
  }
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${formatNumber(language, minutes)}:${String(rest).padStart(2, '0')} min`
}

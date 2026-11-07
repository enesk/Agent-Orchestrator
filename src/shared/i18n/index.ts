import { de, type Catalog, type TranslationKey } from './de'
import { en } from './en'
import { tr } from './tr'
import { LOCALES } from './format'
import type { Language, Message, MessageParams, PluralForms } from './types'

export type { Language, Message, MessageParams, PluralForms } from './types'
export type { Catalog, TranslationKey } from './de'
export {
  LOCALES,
  formatActivityStamp,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatTime,
  formatTimeWithSeconds,
} from './format'

export const LANGUAGES: readonly Language[] = ['de', 'en', 'tr']

export const DEFAULT_LANGUAGE: Language = 'de'

/** Eigenname der Sprache — steht in jeder Sprache gleich im Auswahlfeld. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
  tr: 'Türkçe',
}

/**
 * Die Namen der Sprachen auf Deutsch. Die Anweisungen an die Agenten bleiben deutsch — nur der
 * eine Satz, der die Antwortsprache nennt, greift auf diese Namen zurück.
 */
export const LANGUAGE_NAMES_DE: Record<Language, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  tr: 'Türkisch',
}

const CATALOGS: Record<Language, Catalog> = { de, en, tr }

/** Prüft einen zur Laufzeit gebauten Schlüssel, bevor er an `t()` geht. */
export function isTranslationKey(value: string): value is TranslationKey {
  return Object.hasOwn(de, value)
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** Macht aus `app.getLocale()` („de-DE", „tr", „en-GB") eine unterstützte Sprache. */
export function resolveLanguage(locale: string | null | undefined): Language {
  if (!locale) return DEFAULT_LANGUAGE
  const base = locale.toLowerCase().split(/[-_]/)[0]
  return isLanguage(base) ? base : DEFAULT_LANGUAGE
}

const pluralRules = new Map<Language, Intl.PluralRules>()

function selectForm(language: Language, forms: PluralForms, count: number): string {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(LOCALES[language])
    pluralRules.set(language, rules)
  }
  // Türkisch kennt nach einer Zahl keine Mehrzahl: `tr.ts` liefert nur `other`, und genau
  // deshalb fällt die gewählte Kategorie hier still auf `other` zurück.
  return forms[rules.select(count)] ?? forms.other
}

const PLACEHOLDER = /\{(\w+)\}/g

function interpolate(text: string, params: MessageParams | undefined): string {
  if (!params) return text
  return text.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

function lookup(language: Language, key: TranslationKey): Message {
  const entry = CATALOGS[language][key] as Message | undefined
  return entry ?? (de[key] as Message)
}

export function translate(language: Language, key: TranslationKey, params?: MessageParams): string {
  const entry = lookup(language, key)
  if (typeof entry === 'string') return interpolate(entry, params)
  const count = typeof params?.count === 'number' ? params.count : 0
  return interpolate(selectForm(language, entry, count), params)
}

export interface Translator {
  (key: TranslationKey, params?: MessageParams): string
  readonly language: Language
  readonly locale: string
}

const translators = new Map<Language, Translator>()

/**
 * Liefert pro Sprache **dieselbe** Funktion zurück. Das ist keine Mikro-Optimierung: `t`
 * landet als Abhängigkeit in `useMemo`/`useCallback` und in Props von `React.memo`-Komponenten
 * wie `MessageItem` — eine neue Identität je Renderdurchlauf würde deren Memoisierung
 * aushebeln und beim Streaming wieder alle Nachrichten neu rendern.
 */
export function createTranslator(language: Language): Translator {
  const existing = translators.get(language)
  if (existing) return existing
  const t = ((key: TranslationKey, params?: MessageParams) =>
    translate(language, key, params)) as {
    (key: TranslationKey, params?: MessageParams): string
    language: Language
    locale: string
  }
  t.language = language
  t.locale = LOCALES[language]
  translators.set(language, t)
  return t
}

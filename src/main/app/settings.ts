import { app } from 'electron'
import Store from 'electron-store'
import {
  createTranslator,
  DEFAULT_LANGUAGE,
  isLanguage,
  resolveLanguage,
  type Language,
  type Translator,
} from '@shared/i18n'
import type { AppSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  claudePath: null,
  minimizeToTray: true,
  notificationsEnabled: true,
  language: DEFAULT_LANGUAGE,
}

// `language` steht bewusst nicht in den Store-Defaults: sonst läge dort ab dem ersten Start
// ein Wert, und die Systemsprache käme nie zum Zug.
const { language: _defaultLanguage, ...storeDefaults } = DEFAULTS

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: storeDefaults as AppSettings,
})

/**
 * Ohne gespeicherte Wahl richtet sich die Sprache nach dem System — aber nur, wenn wir sie
 * auch sprechen. `app.getLocale()` ist erst nach `ready` verlässlich, deshalb wird hier
 * jedes Mal nachgesehen statt einmal beim Laden des Moduls.
 */
function defaultLanguage(): Language {
  try {
    return resolveLanguage(app.getLocale())
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function getSettings(): AppSettings {
  const stored = store.get('language')
  return {
    claudePath: store.get('claudePath') ?? null,
    minimizeToTray: store.get('minimizeToTray') ?? DEFAULTS.minimizeToTray,
    notificationsEnabled: store.get('notificationsEnabled') ?? DEFAULTS.notificationsEnabled,
    language: isLanguage(stored) ? stored : defaultLanguage(),
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    store.set(key as keyof AppSettings, value as never)
  }
  return getSettings()
}

export function getLanguage(): Language {
  return getSettings().language
}

/**
 * Übersetzer für die Texte, die der Main-Prozess erzeugt: Fehler, die im Fenster landen, und
 * System-Nachrichten, die im Verlauf gespeichert werden. Wird bei jedem Aufruf frisch aus den
 * Einstellungen gezogen, damit ein Sprachwechsel sofort greift.
 */
export function mainT(): Translator {
  return createTranslator(getLanguage())
}

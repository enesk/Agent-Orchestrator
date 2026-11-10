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
import { DEFAULT_REMOTE_PORT } from '@shared/constants'
import type { AppSettings, PushEnvironmentChoice, PushTriggers } from '@shared/types'

/**
 * `chatDone` ist aus: ein beendeter Agentenlauf im Chat kommt oft genug, dass daraus sonst
 * Dauerfeuer am Sperrbildschirm wird. Alles andere ist ein Ereignis, von dem man wissen will.
 */
const DEFAULT_PUSH_TRIGGERS: PushTriggers = {
  goalDone: true,
  goalFailed: true,
  goalCancelled: true,
  ticketStuck: true,
  rateLimit: true,
  chatDone: false,
  liveActivity: true,
  // An: eine Rückfrage hält einen Lauf auf, bis sie beantwortet ist.
  questionAsked: true,
}

const PUSH_ENVIRONMENTS: readonly PushEnvironmentChoice[] = ['auto', 'sandbox', 'production']

const DEFAULTS: AppSettings = {
  claudePath: null,
  minimizeToTray: true,
  notificationsEnabled: true,
  language: DEFAULT_LANGUAGE,
  // Aus: der Nutzer will Tests nur, wenn er sie ausdrücklich verlangt.
  agentsMayWriteTests: false,
  // Die Fernzugriff-Brücke ist aus, bis sie eingeschaltet wird: ohne Schalter verhält sich die
  // App genau wie vorher.
  remoteEnabled: false,
  remotePort: DEFAULT_REMOTE_PORT,
  webuiPath: null,
  // Der APNs-Versand ist aus, bis er eingeschaltet wird — und bis dahin wird nicht einmal
  // eine Nutzlast gebaut.
  pushEnabled: false,
  pushEnvironment: 'auto',
  pushTriggers: DEFAULT_PUSH_TRIGGERS,
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
    agentsMayWriteTests: store.get('agentsMayWriteTests') ?? DEFAULTS.agentsMayWriteTests,
    remoteEnabled: store.get('remoteEnabled') ?? DEFAULTS.remoteEnabled,
    remotePort: store.get('remotePort') ?? DEFAULTS.remotePort,
    webuiPath: store.get('webuiPath') ?? null,
    pushEnabled: store.get('pushEnabled') ?? DEFAULTS.pushEnabled,
    pushEnvironment: pushEnvironment(store.get('pushEnvironment')),
    // Ein alter Stand kennt neu hinzugekommene Anlässe nicht; der Standard füllt sie auf.
    pushTriggers: { ...DEFAULT_PUSH_TRIGGERS, ...(store.get('pushTriggers') ?? {}) },
  }
}

function pushEnvironment(value: unknown): PushEnvironmentChoice {
  return PUSH_ENVIRONMENTS.includes(value as PushEnvironmentChoice)
    ? (value as PushEnvironmentChoice)
    : 'auto'
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

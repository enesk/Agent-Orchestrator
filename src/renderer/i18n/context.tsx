import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import {
  createTranslator,
  DEFAULT_LANGUAGE,
  type Language,
  type Translator,
} from '@shared/i18n'
import { useSettingsStore } from '../store/settingsStore'
import { setActiveTranslator } from './active'

const I18nContext = createContext<Translator>(createTranslator(DEFAULT_LANGUAGE))

/**
 * Die aktive Sprache steht ganz oben im Baum: ein Wechsel rendert alles neu, im Ruhezustand
 * ändert sich der Wert nie. Der Wert selbst ist der Übersetzer aus `createTranslator`, der
 * pro Sprache stabil ist — dadurch bleibt `React.memo` weiter unten wirksam.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useSettingsStore((state) => state.settings?.language) ?? DEFAULT_LANGUAGE
  const t = useMemo(() => createTranslator(language), [language])

  useEffect(() => {
    setActiveTranslator(t)
    document.documentElement.lang = language
  }, [t, language])

  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>
}

/** Der Übersetzer der aktiven Sprache. Identität bleibt gleich, solange die Sprache steht. */
export function useT(): Translator {
  return useContext(I18nContext)
}

export function useLanguage(): Language {
  return useContext(I18nContext).language
}

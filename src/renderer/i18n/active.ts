import { createTranslator, DEFAULT_LANGUAGE, type Translator } from '@shared/i18n'

let active: Translator = createTranslator(DEFAULT_LANGUAGE)

export function setActiveTranslator(translator: Translator): void {
  active = translator
}

/**
 * Zugriff auf den Übersetzer außerhalb von React — Zustand-Stores und Hilfsfunktionen, die
 * keinen Hook aufrufen können. In Komponenten immer `useT()` benutzen, sonst rendert ein
 * Sprachwechsel nicht neu.
 */
export function activeT(): Translator {
  return active
}

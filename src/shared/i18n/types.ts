/**
 * Ein Eintrag im Katalog: entweder ein fertiger Text oder — wenn eine Zahl darin vorkommt —
 * die Mehrzahlformen. Welche Form gezogen wird, entscheidet `Intl.PluralRules` mit der
 * aktiven Sprache; fehlt die gewählte Form, greift `other`. Türkisch kommt dadurch mit
 * einer einzigen Form aus (nach einer Zahl steht das Substantiv im Singular).
 */
export interface PluralForms {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export type Message = string | PluralForms

export type MessageParams = Record<string, string | number>

export type Language = 'de' | 'en' | 'tr'

export type ClassValue = string | false | null | undefined

/** Fügt Klassennamen zusammen und wirft Falsy-Werte weg. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}

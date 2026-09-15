/** Die CLI nennt Skills nach ihrem Ordner — lange Namen machen nur den Aufruf unhandlich. */
const SLUG_MAX_LENGTH = 48

/**
 * Slug ohne Eindeutigkeitszähler: klein, nur `[a-z0-9-]`. Main und Renderer teilen sich die
 * Funktion, damit die Live-Vorschau im Editor genau das zeigt, was gespeichert wird.
 */
export function baseSkillSlug(raw: string): string {
  return (
    raw
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, SLUG_MAX_LENGTH)
      .replace(/-+$/, '') || 'skill'
  )
}

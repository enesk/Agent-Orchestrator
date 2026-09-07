import path from 'node:path'

/**
 * Löst einen `attachment://`-Pfad innerhalb des Anhang-Verzeichnisses auf.
 *
 * Ein simples `resolved.startsWith(root)` reicht hier **nicht**: Ein Geschwisterordner
 * `attachments-evil/` beginnt ebenfalls mit dem Pfad von `attachments/`. Deshalb wird der
 * relative Pfad gebildet und geprüft, dass er weder aus dem Wurzelverzeichnis heraus führt
 * (`..`) noch absolut ist.
 *
 * @returns den absoluten Pfad innerhalb des Wurzelverzeichnisses oder `null`, wenn die
 *          Anfrage ausbricht.
 */
export function resolveAttachmentPath(root: string, requestPath: string): string | null {
  if (requestPath.includes('\0')) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return null
  }

  if (decoded.includes('\0')) return null

  const trimmed = decoded.replace(/^[/\\]+/, '')
  if (trimmed === '') return null

  const absoluteRoot = path.resolve(root)
  const resolved = path.resolve(absoluteRoot, trimmed)
  const relative = path.relative(absoluteRoot, resolved)

  if (relative === '') return null
  if (path.isAbsolute(relative)) return null
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null

  return resolved
}

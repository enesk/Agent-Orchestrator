import path from 'node:path'
import type { MessageParams, TranslationKey } from '@shared/i18n'
import { isHiddenPath, readZip, ZipError, type ZipErrorCode } from './zip'

/**
 * Liest hochgeladene Skills — eine Markdown-Datei oder ein Archiv mit `SKILL.md` und Beidateien —
 * und prüft Pfade für das Schreiben unter `userData/skill-files/<skillId>/`. Ohne Electron,
 * damit `npm run test:security` es direkt fahren kann.
 */

export const SKILL_FILE_MAX_BYTES = 5 * 1024 * 1024
export const SKILL_TOTAL_MAX_BYTES = 20 * 1024 * 1024
export const SKILL_MAX_FILES = 100
/** Ein Archiv, das größer ist als sein erlaubter Inhalt plus Verwaltungsdaten, kann nicht passen. */
export const SKILL_ARCHIVE_MAX_BYTES = SKILL_TOTAL_MAX_BYTES + 2 * 1024 * 1024
const MAX_ZIP_ENTRIES = 1000
const MAX_REL_PATH_LENGTH = 240

export const SKILL_MAIN_FILE = 'SKILL.md'

export class SkillImportError extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly params: MessageParams = {},
  ) {
    super(key)
    this.name = 'SkillImportError'
  }
}

export interface ParsedSkillFile {
  /** Relativ zur `SKILL.md`, Groß- und Kleinschreibung wie im Archiv. */
  relPath: string
  data: Buffer
}

export interface ParsedSkill {
  name: string
  /** Rohwert für den Slug — normalisiert und eindeutig gemacht wird im Service. */
  slugSource: string
  description: string
  content: string
  files: ParsedSkillFile[]
}

export function isSkillMainFileName(fileName: string): boolean {
  return fileName.toLowerCase() === SKILL_MAIN_FILE.toLowerCase()
}

/** Nimmt `.md` unter beliebigem Namen und `.zip` an. */
export function parseSkillUpload(fileName: string, data: Buffer): ParsedSkill {
  const baseName = path.basename(fileName.replace(/\\/g, '/'))
  const extension = path.extname(baseName).toLowerCase()

  if (extension === '.zip') return parseSkillArchive(baseName, data)
  if (extension === '.md' || extension === '.markdown') {
    if (data.length > SKILL_FILE_MAX_BYTES) {
      throw new SkillImportError('main.skillImport.fileTooLarge', { path: baseName })
    }
    const fileSlug = isSkillMainFileName(baseName) ? '' : stripExtension(baseName)
    return fromMarkdown(data.toString('utf8'), fileSlug, [])
  }
  throw new SkillImportError('main.skillImport.unsupportedType', { name: baseName })
}

export function parseSkillArchive(archiveName: string, data: Buffer): ParsedSkill {
  if (data.length > SKILL_ARCHIVE_MAX_BYTES) {
    throw new SkillImportError('main.skillImport.archiveTooLarge')
  }

  let entries
  try {
    entries = readZip(data, {
      maxFileBytes: SKILL_FILE_MAX_BYTES,
      maxTotalBytes: SKILL_TOTAL_MAX_BYTES,
      maxFiles: SKILL_MAX_FILES,
      maxEntries: MAX_ZIP_ENTRIES,
    })
  } catch (error) {
    if (error instanceof ZipError) throw zipErrorToImportError(error)
    throw error
  }

  const mains = entries.filter((entry) => isSkillMainFileName(path.posix.basename(entry.path)))
  if (mains.length === 0) throw new SkillImportError('main.skillImport.noSkillFile')
  if (mains.length > 1) {
    throw new SkillImportError('main.skillImport.multipleSkillFiles', {
      paths: mains.map((entry) => entry.path).join(', '),
    })
  }

  const main = mains[0]!
  const baseDir = path.posix.dirname(main.path)
  const prefix = baseDir === '.' ? '' : `${baseDir}/`
  const seen = new Set<string>()
  const files: ParsedSkillFile[] = []

  for (const entry of entries) {
    if (entry === main) continue
    if (!entry.path.startsWith(prefix)) {
      throw new SkillImportError('main.skillImport.outsideSkillDir', { path: entry.path })
    }
    const relPath = entry.path.slice(prefix.length)
    // macOS unterscheidet im Dateisystem nicht nach Schreibweise — zwei solche Einträge überschrieben sich.
    const key = relPath.toLowerCase()
    if (seen.has(key)) throw new SkillImportError('main.skillImport.duplicatePath', { path: relPath })
    seen.add(key)
    files.push({ relPath, data: entry.data })
  }

  const folderSlug = prefix ? path.posix.basename(baseDir) : stripExtension(archiveName)
  return fromMarkdown(main.data.toString('utf8'), folderSlug, files)
}

function fromMarkdown(text: string, slugSource: string, files: ParsedSkillFile[]): ParsedSkill {
  const { frontmatter, body } = splitFrontmatter(text)
  const description = (frontmatter.description ?? '').trim()
  if (!description) throw new SkillImportError('main.skillImport.descriptionMissing')

  const frontmatterName = (frontmatter.name ?? '').trim()
  const name = frontmatterName || slugSource || 'Skill'
  return {
    name,
    slugSource: slugSource || name,
    description,
    content: body.replace(/^\s*\n/, '').trimEnd(),
    files,
  }
}

function zipErrorToImportError(error: ZipError): SkillImportError {
  const entry = error.entryName ?? ''
  const keys: Record<ZipErrorCode, TranslationKey> = {
    corrupt: 'main.skillImport.corrupt',
    unsupported: 'main.skillImport.unsupportedArchive',
    encrypted: 'main.skillImport.encrypted',
    unsafePath: 'main.skillImport.unsafePath',
    fileTooLarge: 'main.skillImport.fileTooLarge',
    totalTooLarge: 'main.skillImport.totalTooLarge',
    tooManyFiles: 'main.skillImport.tooManyFiles',
  }
  return new SkillImportError(keys[error.code], { path: entry, count: SKILL_MAX_FILES })
}

function stripExtension(fileName: string): string {
  const extension = path.extname(fileName)
  return extension ? fileName.slice(0, -extension.length) : fileName
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Liest das YAML-Frontmatter so weit, wie Skills es brauchen: flache Schlüssel mit einfachen,
 * doppelt oder einfach gequoteten Werten, eingerückten Fortsetzungszeilen und Block-Skalaren
 * (`|`, `>`). Verschachtelte Strukturen werden nicht ausgewertet, stören aber nicht.
 */
export function splitFrontmatter(text: string): {
  frontmatter: Record<string, string>
  body: string
} {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') return { frontmatter: {}, body: normalized }

  const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line))
  if (end === -1) return { frontmatter: {}, body: normalized }

  return {
    frontmatter: parseYamlSubset(lines.slice(1, end)),
    body: lines.slice(end + 1).join('\n'),
  }
}

function parseYamlSubset(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  let index = 0

  while (index < lines.length) {
    const line = lines[index]!
    const match = /^([A-Za-z0-9_-]+)\s*:(?:\s+(.*))?$/.exec(line)
    index += 1
    if (!match) continue

    const key = match[1]!
    const raw = (match[2] ?? '').trim()
    const continuation: string[] = []
    while (index < lines.length && (lines[index] === '' || /^\s/.test(lines[index]!))) {
      continuation.push(lines[index]!)
      index += 1
    }
    while (continuation.length > 0 && continuation[continuation.length - 1]!.trim() === '') {
      continuation.pop()
    }

    result[key] = parseScalar(raw, continuation)
  }
  return result
}

function parseScalar(raw: string, continuation: string[]): string {
  const block = /^([|>])([+-]?)\s*(#.*)?$/.exec(raw)
  if (block) {
    const indent = Math.min(
      ...continuation.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length),
    )
    const content = continuation.map((line) => (line.trim() ? line.slice(indent) : ''))
    const joined =
      block[1] === '|'
        ? content.join('\n')
        : content.reduce((text, line, i) => {
            if (i === 0) return line
            if (line === '') return `${text}\n`
            return text.endsWith('\n') || text === '' ? `${text}${line}` : `${text} ${line}`
          }, '')
    return joined.trimEnd()
  }

  const full = [raw, ...continuation.map((line) => line.trim())].filter((part) => part !== '')
  if (raw.startsWith('"')) return parseDoubleQuoted(full.join(' '))
  if (raw.startsWith("'")) return parseSingleQuoted(full.join(' '))
  return full.join(' ').replace(/\s+#.*$/, '')
}

function parseDoubleQuoted(value: string): string {
  const closing = findClosingQuote(value)
  const inner = value.slice(1, closing === -1 ? undefined : closing)
  return inner.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_match, escape: string) => {
    if (escape.startsWith('u') || escape.startsWith('x')) {
      return String.fromCharCode(parseInt(escape.slice(1), 16))
    }
    const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', ' ': ' ' }
    return simple[escape] ?? escape
  })
}

function findClosingQuote(value: string): number {
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === '\\') i += 1
    else if (value[i] === '"') return i
  }
  return -1
}

function parseSingleQuoted(value: string): string {
  const inner = value.slice(1)
  let out = ''
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === "'") {
      if (inner[i + 1] === "'") {
        out += "'"
        i += 1
      } else break
    } else out += inner[i]
  }
  return out
}

/**
 * JSON-Strings sind gültige YAML-Skalare in doppelten Anführungszeichen — so überstehen
 * Doppelpunkte, Rauten und Zeilenumbrüche das Frontmatter.
 */
export function renderSkillMarkdown(input: {
  name: string
  description: string
  content: string
}): string {
  return [
    '---',
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(input.description)}`,
    '---',
    '',
    input.content.trim(),
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Pfade
// ---------------------------------------------------------------------------

/**
 * Prüft einen vom Nutzer angegebenen Beidatei-Pfad. Liefert ihn mit `/` als Trenner zurück,
 * sonst unverändert — Groß- und Kleinschreibung bleiben, weil der Rumpf genau so verweist.
 */
export function normalizeRelPath(raw: string): string | null {
  const relPath = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!relPath || relPath.length > MAX_REL_PATH_LENGTH || relPath.includes('\0')) return null
  if (/^[A-Za-z]:/.test(relPath)) return null
  const segments = relPath.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  if (isHiddenPath(relPath)) return null
  if (isSkillMainFileName(relPath)) return null
  return relPath
}

/**
 * Löst einen Beidatei-Pfad innerhalb des Skill-Ordners auf. Wie beim `attachment://`-Protokoll
 * reicht `startsWith` nicht — `skill-files/<id>-evil/` begänne ebenfalls mit dem Wurzelpfad.
 *
 * @returns den absoluten Zielpfad oder `null`, wenn der Pfad ausbricht.
 */
export function resolveSkillFilePath(root: string, relPath: string): string | null {
  if (relPath === '' || relPath.includes('\0')) return null
  if (path.isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath)) return null

  const absoluteRoot = path.resolve(root)
  const resolved = path.resolve(absoluteRoot, relPath)
  const relative = path.relative(absoluteRoot, resolved)

  if (relative === '' || path.isAbsolute(relative)) return null
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null
  return resolved
}

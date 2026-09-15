import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * Minimaler ZIP-Leser und -Schreiber auf `node:zlib`. Node bringt Deflate mit, aber keinen
 * Container-Parser; unter den Laufzeit-Abhängigkeiten ist ebenfalls keiner. Unterstützt wird,
 * was Finder, `zip` und Claude beim Verpacken von Skills erzeugen: Stored und Deflate, ohne
 * ZIP64, ohne Verschlüsselung, ohne mehrteilige Archive.
 *
 * Das Archiv ist fremde Eingabe. Jede Größe wird vor dem Entpacken gegen die Grenzen geprüft
 * und beim Entpacken erneut hart gedeckelt — die Angaben im Verzeichnis dürfen lügen.
 */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_MIN_LENGTH = 22
const MAX_COMMENT_LENGTH = 0xffff

const METHOD_STORED = 0
const METHOD_DEFLATE = 8

const FLAG_ENCRYPTED = 0x1
const FLAG_UTF8 = 0x800

const HOST_UNIX = 3
const HOST_DARWIN = 19
const MODE_TYPE_MASK = 0o170000
const MODE_SYMLINK = 0o120000
const MODE_DIRECTORY = 0o040000
const DOS_DIRECTORY = 0x10

export type ZipErrorCode =
  | 'corrupt'
  | 'unsupported'
  | 'encrypted'
  | 'unsafePath'
  | 'fileTooLarge'
  | 'totalTooLarge'
  | 'tooManyFiles'

export class ZipError extends Error {
  constructor(
    readonly code: ZipErrorCode,
    readonly entryName: string | null = null,
  ) {
    super(entryName ? `${code}: ${entryName}` : code)
    this.name = 'ZipError'
  }
}

export interface ZipLimits {
  maxFileBytes: number
  maxTotalBytes: number
  maxFiles: number
  /** Deckel für Verzeichniseinträge insgesamt, auch übersprungene — sonst kostet schon das Zählen. */
  maxEntries: number
}

export interface ZipFile {
  /** Pfad wie im Archiv, `\` als `/` gelesen, sonst unverändert. */
  path: string
  data: Buffer
}

/**
 * Liest alle regulären Dateien. Verzeichnisse, Symlinks, versteckte Einträge (`.DS_Store`,
 * `__MACOSX/`) und leere Dateien werden übersprungen. Ein Eintrag mit absolutem Pfad oder
 * `..`-Segment bricht das ganze Lesen ab — auch wenn er übersprungen würde.
 */
export function readZip(buffer: Buffer, limits: ZipLimits): ZipFile[] {
  const eocd = findEndOfCentralDirectory(buffer)
  const diskNumber = buffer.readUInt16LE(eocd + 4)
  const centralDisk = buffer.readUInt16LE(eocd + 6)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)

  if (diskNumber !== 0 || centralDisk !== 0) throw new ZipError('unsupported')
  if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new ZipError('unsupported')
  }
  if (entryCount > limits.maxEntries) throw new ZipError('tooManyFiles')
  if (centralOffset + centralSize > eocd) throw new ZipError('corrupt')

  const files: ZipFile[] = []
  let total = 0
  let cursor = centralOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new ZipError('corrupt')
    }
    const versionMadeBy = buffer.readUInt16LE(cursor + 4)
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const expectedCrc = buffer.readUInt32LE(cursor + 16)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const declaredSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const externalAttributes = buffer.readUInt32LE(cursor + 38)
    const localOffset = buffer.readUInt32LE(cursor + 42)

    const nameStart = cursor + 46
    const next = nameStart + nameLength + extraLength + commentLength
    if (next > eocd) throw new ZipError('corrupt')
    // Finder setzt das UTF-8-Bit nicht, schreibt aber UTF-8 — CP437 kommt bei Skills praktisch
    // nicht vor. `\` als Trenner stammt von Windows-Packern und würde sonst Prüfungen umgehen.
    const name = buffer
      .subarray(nameStart, nameStart + nameLength)
      .toString('utf8')
      .replace(/\\/g, '/')
    cursor = next

    if (!isSafeEntryName(name)) throw new ZipError('unsafePath', name)

    const host = versionMadeBy >> 8
    const mode = host === HOST_UNIX || host === HOST_DARWIN ? externalAttributes >>> 16 : 0
    const isDirectory =
      name.endsWith('/') ||
      (mode & MODE_TYPE_MASK) === MODE_DIRECTORY ||
      (externalAttributes & DOS_DIRECTORY) !== 0
    if (isDirectory) continue
    if ((mode & MODE_TYPE_MASK) === MODE_SYMLINK) continue
    if (isHiddenPath(name)) continue

    if (flags & FLAG_ENCRYPTED) throw new ZipError('encrypted', name)
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new ZipError('unsupported', name)
    }
    if (declaredSize > limits.maxFileBytes) throw new ZipError('fileTooLarge', name)
    if (total + declaredSize > limits.maxTotalBytes) throw new ZipError('totalTooLarge', name)

    const data = extractEntry(buffer, {
      name,
      method,
      localOffset,
      compressedSize,
      // Die Deckelung gilt beim Entpacken selbst, nicht erst danach: eine Zip-Bombe gibt klein an.
      outputLimit: Math.min(limits.maxFileBytes, limits.maxTotalBytes - total),
      fileLimitIsTighter: limits.maxFileBytes <= limits.maxTotalBytes - total,
      eocd,
    })
    if (data.length !== declaredSize || crc32(data) !== expectedCrc) {
      throw new ZipError('corrupt', name)
    }
    if (data.length === 0) continue

    total += data.length
    files.push({ path: name, data })
    if (files.length > limits.maxFiles) throw new ZipError('tooManyFiles')
  }

  return files
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < EOCD_MIN_LENGTH) throw new ZipError('corrupt')
  const lowest = Math.max(0, buffer.length - EOCD_MIN_LENGTH - MAX_COMMENT_LENGTH)
  for (let offset = buffer.length - EOCD_MIN_LENGTH; offset >= lowest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new ZipError('corrupt')
}

interface ExtractInput {
  name: string
  method: number
  localOffset: number
  compressedSize: number
  outputLimit: number
  fileLimitIsTighter: boolean
  eocd: number
}

function extractEntry(buffer: Buffer, input: ExtractInput): Buffer {
  const { name, localOffset } = input
  if (localOffset + 30 > input.eocd || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new ZipError('corrupt', name)
  }
  const dataStart =
    localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
  const dataEnd = dataStart + input.compressedSize
  if (dataEnd > input.eocd) throw new ZipError('corrupt', name)
  const compressed = buffer.subarray(dataStart, dataEnd)
  const overLimit = new ZipError(input.fileLimitIsTighter ? 'fileTooLarge' : 'totalTooLarge', name)

  if (input.method === METHOD_STORED) {
    if (compressed.length > input.outputLimit) throw overLimit
    return Buffer.from(compressed)
  }

  let data: Buffer
  try {
    data = inflateRawSync(compressed, { maxOutputLength: Math.max(1, input.outputLimit) })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw overLimit
    throw new ZipError('corrupt', name)
  }
  if (data.length > input.outputLimit) throw overLimit
  return data
}

/**
 * Lehnt ab, was beim Entpacken aus dem Zielordner führen könnte. Die endgültige Prüfung
 * geschieht beim Schreiben über `path.relative` — dies hier bricht nur früh und deutlich ab.
 */
function isSafeEntryName(name: string): boolean {
  if (name === '' || name.includes('\0')) return false
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false
  return !name.split('/').some((segment) => segment === '..')
}

export function isHiddenPath(filePath: string): boolean {
  return filePath
    .split('/')
    .some((segment) => segment.startsWith('.') || segment === '__MACOSX')
}

export interface ZipWriteEntry {
  path: string
  data: Buffer
  /** Unix-Modus inklusive Dateityp; Standard ist eine normale Datei `0644`. */
  mode?: number
  /** Nur für Tests: überschreibt die im Verzeichnis angegebene entpackte Größe. */
  declaredSize?: number
  /** Nur für Tests: legt die Daten unkomprimiert ab. */
  stored?: boolean
}

/** Schreibt ein Archiv mit Deflate — für den Export und für die Sicherheitstests. */
export function writeZip(entries: readonly ZipWriteEntry[], modified = new Date()): Buffer {
  const { time, date } = toDosDateTime(modified)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8')
    const stored = entry.stored ?? false
    const body = stored ? entry.data : deflateRawSync(entry.data)
    const crc = crc32(entry.data)
    const size = entry.declaredSize ?? entry.data.length
    const method = stored ? METHOD_STORED : METHOD_DEFLATE
    const mode = entry.mode ?? 0o100644

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIGNATURE, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0)
    central.writeUInt16LE((HOST_UNIX << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(FLAG_UTF8, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE((mode << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)

    locals.push(local, name, body)
    centrals.push(central, name)
    offset += local.length + name.length + body.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = Buffer.alloc(EOCD_MIN_LENGTH)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, ...centrals, eocd])
}

function toDosDateTime(value: Date): { time: number; date: number } {
  const year = Math.max(1980, value.getFullYear())
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  }
}

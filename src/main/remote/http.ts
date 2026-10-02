import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { resolveAttachmentPath } from '../app/attachment-path'
import { mimeForExtension } from './mime'
import type { ContractDescription } from './contract'

/**
 * Die HTTP-Seite der Brücke: `/health`, `/contract`, `/attachments/:id` und die statischen
 * Dateien der Weboberfläche. Alle Abhängigkeiten kommen von außen, damit dieser Weg im
 * Sicherheitstest ohne Electron und ohne Datenbank gefahren werden kann.
 */

export interface AttachmentRecord {
  relativePath: string
  fileName: string
  mimeType: string | null
}

export interface HttpDeps {
  appVersion: string
  contract: () => ContractDescription
  /** Nur die Datenbankzeile; der Pfad wird hier geprüft, nie dort. */
  lookupAttachment: (id: string) => AttachmentRecord | null
  attachmentsRoot: () => string
  /** Verzeichnis mit dem Bau der Weboberfläche. */
  staticRoot: () => string
  onRejected?: (reason: string, detail: Record<string, string>) => void
}

/** Ohne Zugangsschutz ist auch die Herkunft kein Kriterium — der Entwicklungsserver der
 * Weboberfläche läuft auf einem anderen Port und soll die Brücke erreichen. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) {
    response.end()
    return
  }
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  response.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  })
  response.end(payload)
}

function sendFile(
  response: ServerResponse,
  data: Buffer,
  mime: string | null,
  extra: Record<string, string> = {},
): void {
  response.writeHead(200, {
    ...CORS_HEADERS,
    ...(mime ? { 'Content-Type': mime } : {}),
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': data.length,
    ...extra,
  })
  response.end(data)
}

function notFound(response: ServerResponse): void {
  sendJson(response, 404, { error: 'not_found' })
}

/** `/attachments/<id>` → die ID, sonst `null`. Mehr Segmente sind kein Anhang. */
export function attachmentIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/attachments/')) return null
  const rest = pathname.slice('/attachments/'.length)
  if (rest === '' || rest.includes('/')) return null
  try {
    const id = decodeURIComponent(rest)
    // Eine Anhangs-ID ist ein Datenbankschlüssel, kein Pfad. Alles, was wie einer aussieht,
    // wird abgewiesen, statt es der Datenbank hinzuhalten.
    if (id.includes('/') || id.includes('\\') || id.includes('\0') || id.includes('..')) return null
    return id
  } catch {
    return null
  }
}

async function serveAttachment(
  id: string,
  deps: HttpDeps,
  response: ServerResponse,
): Promise<void> {
  const record = deps.lookupAttachment(id)
  if (!record) {
    deps.onRejected?.('Anhang unbekannt', { id })
    notFound(response)
    return
  }

  // Derselbe Schutz wie beim `attachment://`-Protokoll: `path.relative` gegen das
  // Anhangsverzeichnis. Ein manipulierter Datenbankeintrag kommt hier nicht heraus.
  const resolved = resolveAttachmentPath(deps.attachmentsRoot(), record.relativePath)
  if (!resolved) {
    deps.onRejected?.('Anhang außerhalb des Verzeichnisses', { id, path: record.relativePath })
    notFound(response)
    return
  }

  let data: Buffer
  try {
    data = await readFile(resolved)
  } catch {
    notFound(response)
    return
  }

  const mime = record.mimeType ?? mimeForExtension(path.extname(resolved))
  sendFile(response, data, mime, {
    // Keine HTML-Anhänge im Browser des Telefons ausführen lassen.
    'Content-Security-Policy': 'sandbox',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
  })
}

async function readIfFile(candidate: string): Promise<Buffer | null> {
  try {
    const info = await stat(candidate)
    if (!info.isFile()) return null
    return await readFile(candidate)
  } catch {
    return null
  }
}

async function serveStatic(
  pathname: string,
  deps: HttpDeps,
  response: ServerResponse,
): Promise<void> {
  const root = deps.staticRoot()
  const request = pathname === '/' ? 'index.html' : pathname

  // Dieselbe Regel wie für Anhänge: der aufgelöste Pfad muss im Wurzelverzeichnis liegen.
  const resolved = resolveAttachmentPath(root, request)
  if (!resolved) {
    deps.onRejected?.('Statischer Pfad außerhalb des Verzeichnisses', { pathname })
    notFound(response)
    return
  }

  const direct = await readIfFile(resolved)
  if (direct) {
    sendFile(response, direct, mimeForExtension(path.extname(resolved)))
    return
  }

  // Unbekannte Pfade gehören der Weboberfläche: sie hat eigene Routen.
  const index = resolveAttachmentPath(root, 'index.html')
  const fallback = index ? await readIfFile(index) : null
  if (!fallback) {
    notFound(response)
    return
  }
  sendFile(response, fallback, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' })
}

export function createRequestHandler(
  deps: HttpDeps,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const method = request.method ?? 'GET'
    const pathname = (request.url ?? '/').split('?')[0]!

    if (method === 'OPTIONS') {
      response.writeHead(204, CORS_HEADERS)
      response.end()
      return
    }

    if (method !== 'GET' && method !== 'HEAD') {
      // Aufrufe laufen über den WebSocket; HTTP liefert nur aus.
      sendJson(response, 405, { error: 'method_not_allowed' })
      return
    }

    if (pathname === '/health') {
      const contract = deps.contract()
      sendJson(response, 200, {
        ok: true,
        appVersion: contract.appVersion,
        contractVersion: contract.version,
      })
      return
    }

    if (pathname === '/contract') {
      sendJson(response, 200, deps.contract())
      return
    }

    if (pathname.startsWith('/attachments/') || pathname === '/attachments') {
      const id = attachmentIdFromPath(pathname)
      if (!id) {
        deps.onRejected?.('Anhangspfad abgewiesen', { pathname })
        notFound(response)
        return
      }
      await serveAttachment(id, deps, response)
      return
    }

    await serveStatic(pathname, deps, response)
  }
}

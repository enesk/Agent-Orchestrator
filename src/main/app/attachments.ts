import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { app, protocol } from 'electron'
import { resolveAttachmentPath } from './attachment-path'
import { logger } from '../Logger'

export const ATTACHMENT_SCHEME = 'attachment'

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
}

/**
 * HTML wird im Standardbrowser geöffnet, nicht in der App. Sollte trotzdem je einmal ein
 * `attachment://…​.html` in einem Fenster landen, hält dieser Header fremde Skripte auf —
 * das Schema ist `standard` und `secure`, hier läuft sonst fremder Code mit App-Rechten.
 */
const SANDBOX_HEADER = { 'Content-Security-Policy': 'sandbox' }

export function getAttachmentsRoot(): string {
  return path.join(app.getPath('userData'), 'attachments')
}

/** Muss vor `app.whenReady()` laufen, sonst akzeptiert Electron das Schema nicht. */
export function registerAttachmentSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ])
}

export function registerAttachmentProtocol(): void {
  const root = getAttachmentsRoot()
  mkdirSync(root, { recursive: true })

  protocol.handle(ATTACHMENT_SCHEME, async (request) => {
    const url = new URL(request.url)
    // Bei `attachment://a/b.png` landet `a` im Host — sonst ginge das erste Segment verloren.
    const requestPath = `${url.hostname}${url.pathname}`
    const resolved = resolveAttachmentPath(root, requestPath)

    if (!resolved) {
      logger.warn('attachments', 'Zugriff außerhalb des Anhang-Verzeichnisses abgewiesen', {
        url: request.url,
      })
      return new Response('Nicht gefunden', { status: 404 })
    }

    try {
      const data = await readFile(resolved)
      const extension = path.extname(resolved).toLowerCase()
      const mime = MIME_BY_EXTENSION[extension]
      const isHtml = extension === '.html' || extension === '.htm'
      return new Response(new Uint8Array(data), {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          ...(mime ? { 'Content-Type': mime } : {}),
          ...(isHtml ? SANDBOX_HEADER : {}),
        },
      })
    } catch {
      return new Response('Nicht gefunden', { status: 404 })
    }
  })
}

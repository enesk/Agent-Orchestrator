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
}

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
      const mime = MIME_BY_EXTENSION[path.extname(resolved).toLowerCase()]
      return new Response(new Uint8Array(data), {
        headers: mime ? { 'Content-Type': mime } : undefined,
      })
    } catch {
      return new Response('Nicht gefunden', { status: 404 })
    }
  })
}

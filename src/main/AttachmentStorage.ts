import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import { log } from './Logger'
import type { MessageAttachment } from '@shared/types'

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export interface SaveAttachmentInput {
  messageId: string
  fileName: string
  mimeType: string
  data: Buffer
}

export class AttachmentStorage {
  private rootDir!: string

  initialize(): void {
    this.rootDir = path.join(app.getPath('userData'), 'attachments')
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true })
    }
    log('info', `AttachmentStorage initialized at ${this.rootDir}`)
  }

  save(input: SaveAttachmentInput): MessageAttachment {
    if (!ALLOWED_MIME.has(input.mimeType.toLowerCase())) {
      throw new Error(`Unsupported mime type: ${input.mimeType}`)
    }
    if (input.data.length > MAX_BYTES) {
      throw new Error(`Attachment too large: ${input.data.length} bytes (max ${MAX_BYTES})`)
    }

    const dir = path.join(this.rootDir, input.messageId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const id = crypto.randomUUID()
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'image'
    const filePath = path.join(dir, `${id}_${safeName}`)
    fs.writeFileSync(filePath, input.data)

    return {
      id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      localPath: filePath,
      size: input.data.length,
    }
  }

  deleteForMessage(messageId: string): void {
    const dir = path.join(this.rootDir, messageId)
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (err) {
        log('warn', `Failed to delete attachments for ${messageId}: ${(err as Error).message}`)
      }
    }
  }
}

export const attachmentStorage = new AttachmentStorage()

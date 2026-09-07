import { getDb, nowIso } from '../connection'
import { buildUpdate, newId, parseJsonObject, parseStringArray, toJson } from '../utils'
import type {
  ChatMessage,
  JsonObject,
  MessageAttachment,
  MessageRole,
  MessageStatus,
} from '@shared/types'

interface MessageRow {
  id: string
  project_id: string
  role: MessageRole
  agent_id: string | null
  content: string
  thinking: string | null
  mentions: string
  reply_to_id: string | null
  status: MessageStatus
  error_code: string | null
  metadata: string
  created_at: string
}

interface AttachmentRow {
  id: string
  message_id: string | null
  ticket_id: string | null
  file_name: string
  mime_type: string | null
  relative_path: string
  size: number
  created_at: string
}

function toAttachment(row: AttachmentRow): MessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    ticketId: row.ticket_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    relativePath: row.relative_path,
    size: row.size,
    createdAt: row.created_at,
  }
}

function toMessage(row: MessageRow, attachments: MessageAttachment[]): ChatMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    role: row.role,
    agentId: row.agent_id,
    content: row.content,
    thinking: row.thinking,
    mentions: parseStringArray(row.mentions),
    replyToId: row.reply_to_id,
    status: row.status,
    errorCode: row.error_code,
    metadata: parseJsonObject(row.metadata),
    createdAt: row.created_at,
    attachments,
  }
}

/** Hängt die Anhänge aller übergebenen Nachrichten in einem Rutsch an. */
function hydrate(rows: MessageRow[]): ChatMessage[] {
  if (rows.length === 0) return []
  const placeholders = rows.map(() => '?').join(', ')
  const attachments = getDb()
    .prepare<string[], AttachmentRow>(
      `SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at`,
    )
    .all(...rows.map((row) => row.id))

  const byMessage = new Map<string, MessageAttachment[]>()
  for (const row of attachments) {
    if (!row.message_id) continue
    const list = byMessage.get(row.message_id) ?? []
    list.push(toAttachment(row))
    byMessage.set(row.message_id, list)
  }

  return rows.map((row) => toMessage(row, byMessage.get(row.id) ?? []))
}

export interface ListMessagesOptions {
  projectId: string
  limit?: number
  /** Nachrichten-ID; es werden nur ältere Nachrichten geliefert (Paginierung nach oben). */
  before?: string | null
}

export function listMessages(options: ListMessagesOptions): ChatMessage[] {
  const limit = options.limit ?? 200
  const db = getDb()

  let rows: MessageRow[]
  if (options.before) {
    const anchor = db
      .prepare<[string], { created_at: string }>('SELECT created_at FROM messages WHERE id = ?')
      .get(options.before)
    rows = db
      .prepare<[string, string, number], MessageRow>(
        `SELECT * FROM messages
          WHERE project_id = ? AND created_at < ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(options.projectId, anchor?.created_at ?? nowIso(), limit)
  } else {
    rows = db
      .prepare<[string, number], MessageRow>(
        `SELECT * FROM messages
          WHERE project_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(options.projectId, limit)
  }

  return hydrate(rows.reverse())
}

export function getMessage(id: string): ChatMessage | null {
  const row = getDb().prepare<[string], MessageRow>('SELECT * FROM messages WHERE id = ?').get(id)
  return row ? hydrate([row])[0]! : null
}

/** Die Ursprungsnachricht plus alle Antworten darauf, chronologisch. */
export function listThread(messageId: string): ChatMessage[] {
  const rows = getDb()
    .prepare<[string, string], MessageRow>(
      `SELECT * FROM messages
        WHERE id = ? OR reply_to_id = ?
        ORDER BY created_at, rowid`,
    )
    .all(messageId, messageId)
  return hydrate(rows)
}

export interface CreateMessageInput {
  id?: string
  projectId: string
  role: MessageRole
  agentId?: string | null
  content?: string
  thinking?: string | null
  mentions?: string[]
  replyToId?: string | null
  status?: MessageStatus
  errorCode?: string | null
  metadata?: JsonObject
  createdAt?: string
}

export function createMessage(input: CreateMessageInput): ChatMessage {
  const id = input.id ?? newId()
  getDb()
    .prepare(
      `INSERT INTO messages (id, project_id, role, agent_id, content, thinking, mentions,
                             reply_to_id, status, error_code, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.role,
      input.agentId ?? null,
      input.content ?? '',
      input.thinking ?? null,
      toJson(input.mentions ?? []),
      input.replyToId ?? null,
      input.status ?? 'done',
      input.errorCode ?? null,
      toJson(input.metadata ?? {}),
      input.createdAt ?? nowIso(),
    )
  return getMessage(id)!
}

export interface UpdateMessageInput {
  content?: string
  thinking?: string | null
  mentions?: string[]
  status?: MessageStatus
  errorCode?: string | null
  metadata?: JsonObject
}

export function updateMessage(id: string, patch: UpdateMessageInput): ChatMessage {
  const { clause, values } = buildUpdate({
    content: patch.content,
    thinking: patch.thinking,
    mentions: patch.mentions === undefined ? undefined : toJson(patch.mentions),
    status: patch.status,
    error_code: patch.errorCode,
    metadata: patch.metadata === undefined ? undefined : toJson(patch.metadata),
  })
  if (clause) {
    getDb().prepare(`UPDATE messages SET ${clause} WHERE id = ?`).run(...values, id)
  }
  const message = getMessage(id)
  if (!message) throw new Error(`Nachricht ${id} existiert nicht`)
  return message
}

/** Hängt Text an eine streamende Nachricht an, ohne sie vorher zu lesen. */
export function appendMessageContent(id: string, delta: string): void {
  getDb().prepare('UPDATE messages SET content = content || ? WHERE id = ?').run(delta, id)
}

export function appendMessageThinking(id: string, delta: string): void {
  getDb()
    .prepare("UPDATE messages SET thinking = IFNULL(thinking, '') || ? WHERE id = ?")
    .run(delta, id)
}

export function deleteMessage(id: string): void {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(id)
}

export function deleteProjectMessages(projectId: string): void {
  getDb().prepare('DELETE FROM messages WHERE project_id = ?').run(projectId)
}

/** Nachrichten, die beim letzten Beenden mitten im Stream hingen. */
export function markStaleStreamingMessages(): number {
  const result = getDb()
    .prepare(
      `UPDATE messages SET status = 'stopped', error_code = 'interrupted'
        WHERE status = 'streaming'`,
    )
    .run()
  return result.changes
}

// --- Anhänge ----------------------------------------------------------------

export interface CreateAttachmentInput {
  messageId?: string | null
  ticketId?: string | null
  fileName: string
  mimeType?: string | null
  relativePath: string
  size: number
}

export function createAttachment(input: CreateAttachmentInput): MessageAttachment {
  const id = newId()
  getDb()
    .prepare(
      `INSERT INTO attachments (id, message_id, ticket_id, file_name, mime_type,
                                relative_path, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.messageId ?? null,
      input.ticketId ?? null,
      input.fileName,
      input.mimeType ?? null,
      input.relativePath,
      input.size,
      nowIso(),
    )
  return getAttachment(id)!
}

export function getAttachment(id: string): MessageAttachment | null {
  const row = getDb()
    .prepare<[string], AttachmentRow>('SELECT * FROM attachments WHERE id = ?')
    .get(id)
  return row ? toAttachment(row) : null
}

export function listAttachmentsForMessage(messageId: string): MessageAttachment[] {
  return getDb()
    .prepare<[string], AttachmentRow>(
      'SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at',
    )
    .all(messageId)
    .map(toAttachment)
}

export function listAttachmentsForTicket(ticketId: string): MessageAttachment[] {
  return getDb()
    .prepare<[string], AttachmentRow>(
      'SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at',
    )
    .all(ticketId)
    .map(toAttachment)
}

export function attachToMessage(attachmentIds: string[], messageId: string): void {
  if (attachmentIds.length === 0) return
  const statement = getDb().prepare('UPDATE attachments SET message_id = ? WHERE id = ?')
  const run = getDb().transaction(() => {
    for (const id of attachmentIds) statement.run(messageId, id)
  })
  run()
}

export function deleteAttachment(id: string): void {
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id)
}

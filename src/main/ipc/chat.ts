import {
  deleteMessage,
  history,
  retryMessage,
  saveAttachment,
  send,
  stopMessage,
  thread,
} from '../chat'
import type { DomainHandlers } from './registry'

export const chatHandlers: DomainHandlers<'chat'> = {
  send: (input) =>
    send({
      projectId: input.projectId,
      content: input.content,
      mentions: input.mentions,
      replyToId: input.replyToId ?? null,
      attachmentIds: input.attachmentIds,
    }),
  history: (input) =>
    history({ projectId: input.projectId, limit: input.limit, before: input.before ?? null }),
  deleteMessage: (input) => {
    deleteMessage(input.id)
    return { ok: true }
  },
  retryMessage: (input) => retryMessage(input.id),
  stopMessage: (input) => {
    stopMessage(input.id)
    return { ok: true }
  },
  thread: (input) => thread(input.messageId),
  saveAttachment: (input) =>
    saveAttachment({
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
      dataBase64: input.dataBase64,
      messageId: input.messageId ?? null,
      ticketId: input.ticketId ?? null,
    }),
}

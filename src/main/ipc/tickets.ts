import * as tickets from '../tickets/TicketService'
import type { DomainHandlers } from './registry'

export const ticketsHandlers: DomainHandlers<'tickets'> = {
  list: (filter) => tickets.list(filter),
  get: ({ id }) => tickets.get(id),
  create: (input) => tickets.create(input),
  update: ({ id, patch }) => tickets.update(id, patch),
  remove: async ({ id }) => {
    await tickets.remove(id)
    return { ok: true }
  },
  removeMany: ({ ids }) => tickets.removeMany(ids),
  addComment: ({ ticketId, content, authorType, agentId }) =>
    tickets.addComment({ ticketId, content, authorType, agentId }),
  removeComment: ({ commentId }) => tickets.removeComment(commentId),
  clearComments: ({ ticketId }) => tickets.clearComments(ticketId),
  removeAttachment: async ({ ticketId, attachmentId }) => {
    await tickets.removeAttachment(ticketId, attachmentId)
    return { ok: true }
  },
  setDependencies: ({ ticketId, dependsOn }) => tickets.setDependencies(ticketId, dependsOn),
  importJson: ({ projectId, json }) => tickets.importJson(projectId, json),
}

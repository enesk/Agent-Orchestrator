import * as tickets from '../tickets/TicketService'
import type { DomainHandlers } from './registry'

export const ticketsHandlers: DomainHandlers<'tickets'> = {
  list: (filter) => tickets.list(filter),
  get: ({ id }) => tickets.get(id),
  create: (input) => tickets.create(input),
  update: ({ id, patch }) => tickets.update(id, patch),
  remove: ({ id }) => {
    tickets.remove(id)
    return { ok: true }
  },
  addComment: ({ ticketId, content, authorType, agentId }) =>
    tickets.addComment({ ticketId, content, authorType, agentId }),
  setDependencies: ({ ticketId, dependsOn }) => tickets.setDependencies(ticketId, dependsOn),
  importJson: ({ projectId, json }) => tickets.importJson(projectId, json),
}

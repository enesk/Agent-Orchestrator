import * as servers from '../mcp/McpServerService'
import type { DomainHandlers } from './registry'

export const mcpHandlers: DomainHandlers<'mcp'> = {
  list: () => servers.list(),
  listForProject: ({ projectId }) => servers.listForProject(projectId),
  create: (input) => servers.create(input),
  update: ({ id, patch }) => servers.update(id, patch),
  remove: ({ id }) => {
    servers.remove(id)
    return { ok: true }
  },
  assign: ({ projectId, serverId }) => servers.assign(projectId, serverId),
  unassign: ({ projectId, serverId }) => servers.unassign(projectId, serverId),
  probe: (input) => servers.probe(input),
}

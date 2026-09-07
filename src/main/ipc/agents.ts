import * as agents from '../agents/AgentService'
import type { DomainHandlers } from './registry'

export const agentsHandlers: DomainHandlers<'agents'> = {
  list: ({ projectId }) => agents.list(projectId),
  create: (input) => agents.create(input),
  update: ({ id, patch }) => agents.update(id, patch),
  remove: ({ id }) => {
    agents.remove(id)
    return { ok: true }
  },
  addToProject: ({ projectId, agentId, sortOrder }) =>
    agents.addToProject(projectId, agentId, sortOrder),
  removeFromProject: ({ projectId, agentId }) => {
    agents.removeFromProject(projectId, agentId)
    return { ok: true }
  },
  setStopped: ({ projectId, agentId, stopped }) =>
    agents.setStopped(projectId, agentId, stopped),
  generatePrompt: ({ description, name, role }) =>
    agents.generatePrompt({ description, name, role }),
}

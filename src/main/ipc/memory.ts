import * as memory from '../memory/MemoryService'
import type { DomainHandlers } from './registry'

export const memoryHandlers: DomainHandlers<'memory'> = {
  list: ({ agentId, projectId }) => memory.list({ agentId, projectId }),
  save: (input) => memory.save(input),
  remove: ({ id }) => {
    memory.remove(id)
    return { ok: true }
  },
  removeMany: ({ ids }) => ({ removed: memory.removeMany(ids) }),
  clear: ({ agentId, projectId }) => ({ removed: memory.clear({ agentId, projectId }) }),
}

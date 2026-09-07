import * as projects from '../projects/ProjectService'
import type { DomainHandlers } from './registry'

export const projectsHandlers: DomainHandlers<'projects'> = {
  list: () => projects.list(),
  get: ({ id }) => projects.get(id),
  create: (input) => projects.create(input),
  update: ({ id, patch }) => projects.update(id, patch),
  remove: ({ id }) => {
    projects.remove(id)
    return { ok: true }
  },
  pickPath: async () => ({ path: await projects.pickPath() }),
}

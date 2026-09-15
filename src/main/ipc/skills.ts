import * as skills from '../skills/SkillService'
import type { DomainHandlers } from './registry'

export const skillsHandlers: DomainHandlers<'skills'> = {
  list: () => skills.list(),
  create: (input) => skills.create(input),
  update: ({ id, patch }) => skills.update(id, patch),
  remove: ({ id }) => {
    skills.remove(id)
    return { ok: true }
  },
}

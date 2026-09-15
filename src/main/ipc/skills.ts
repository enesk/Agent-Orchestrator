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
  previewImport: (input) => skills.previewImport(input),
  confirmImport: (input) => skills.confirmImport(input),
  discardImport: ({ token }) => {
    skills.discardImport(token)
    return { ok: true }
  },
  addFile: (input) => skills.addFile(input),
  removeFile: (input) => skills.removeFile(input),
  export: ({ id }) => skills.exportSkill(id),
}

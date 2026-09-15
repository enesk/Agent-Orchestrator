import { create } from 'zustand'
import type { IpcRequest } from '@shared/ipc-contract'
import type { Skill } from '@shared/types'
import { toErrorMessage } from './errorMessage'

interface SkillState {
  skills: Skill[]
  loaded: boolean
  loading: boolean
  error: string | null

  load: () => Promise<void>
  create: (input: IpcRequest<'skills', 'create'>) => Promise<Skill>
  update: (id: string, patch: IpcRequest<'skills', 'update'>['patch']) => Promise<Skill>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** Skills sind global wie Agenten — eine Liste, die Agenten-Editor und Skill-Reiter teilen. */
export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const skills = await window.api.skills.list()
      set({ skills: sortSkills(skills), loaded: true, loading: false })
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) })
    }
  },

  create: async (input) => {
    const skill = await window.api.skills.create(input)
    set({ skills: sortSkills([...get().skills.filter((item) => item.id !== skill.id), skill]) })
    return skill
  },

  update: async (id, patch) => {
    const skill = await window.api.skills.update({ id, patch })
    set({ skills: sortSkills(get().skills.map((item) => (item.id === id ? skill : item))) })
    return skill
  },

  remove: async (id) => {
    await window.api.skills.remove({ id })
    set({ skills: get().skills.filter((item) => item.id !== id) })
  },

  subscribe: () =>
    window.api.on('skill.changed', () => {
      void get().load()
    }),
}))

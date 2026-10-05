import { create } from 'zustand'
import type { IpcRequest } from '@shared/ipc-contract'
import type { McpServer } from '@shared/types'
import { toErrorMessage } from './errorMessage'

interface McpState {
  servers: McpServer[]
  /** Zuweisungen je Projekt, nachgeladen wenn die Projekteinstellungen sie brauchen. */
  byProject: Record<string, McpServer[]>
  loaded: boolean
  loading: boolean
  error: string | null

  load: () => Promise<void>
  loadForProject: (projectId: string) => Promise<McpServer[]>
  create: (input: IpcRequest<'mcp', 'create'>) => Promise<McpServer>
  update: (id: string, patch: IpcRequest<'mcp', 'update'>['patch']) => Promise<McpServer>
  remove: (id: string) => Promise<void>
  assign: (projectId: string, serverId: string) => Promise<void>
  unassign: (projectId: string, serverId: string) => Promise<void>
  subscribe: () => () => void
}

function sortServers(servers: McpServer[]): McpServer[] {
  return [...servers].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** MCP-Server sind global wie Skills — zugewiesen werden sie pro Projekt. */
export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  byProject: {},
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const servers = await window.api.mcp.list()
      set({ servers: sortServers(servers), loaded: true, loading: false })
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) })
    }
  },

  loadForProject: async (projectId) => {
    const servers = sortServers(await window.api.mcp.listForProject({ projectId }))
    set({ byProject: { ...get().byProject, [projectId]: servers } })
    return servers
  },

  create: async (input) => {
    const server = await window.api.mcp.create(input)
    set({ servers: sortServers([...get().servers.filter((item) => item.id !== server.id), server]) })
    return server
  },

  update: async (id, patch) => {
    const server = await window.api.mcp.update({ id, patch })
    set({ servers: sortServers(get().servers.map((item) => (item.id === id ? server : item))) })
    return server
  },

  remove: async (id) => {
    await window.api.mcp.remove({ id })
    const byProject: Record<string, McpServer[]> = {}
    for (const [projectId, servers] of Object.entries(get().byProject)) {
      byProject[projectId] = servers.filter((item) => item.id !== id)
    }
    set({ servers: get().servers.filter((item) => item.id !== id), byProject })
  },

  assign: async (projectId, serverId) => {
    const servers = sortServers(await window.api.mcp.assign({ projectId, serverId }))
    set({ byProject: { ...get().byProject, [projectId]: servers } })
  },

  unassign: async (projectId, serverId) => {
    const servers = sortServers(await window.api.mcp.unassign({ projectId, serverId }))
    set({ byProject: { ...get().byProject, [projectId]: servers } })
  },

  subscribe: () =>
    window.api.on('mcpServer.changed', (payload) => {
      void get().load()
      if (payload.projectId) void get().loadForProject(payload.projectId)
    }),
}))

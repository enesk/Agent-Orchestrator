import { useState, useEffect, useCallback } from 'react'
import { useIpc } from './useIpc'
import type { Project, ProjectAgent, ChatMessage, MessageAttachment } from '@shared/types'

export function useChatState() {
  const ipc = useIpc()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  // Load projects
  useEffect(() => {
    ipc.getProjects()
      .then((p) => {
        setProjects(p)
        if (p.length > 0 && !activeProjectId) {
          setActiveProjectId(p[0].id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Load messages when active project changes
  useEffect(() => {
    if (!activeProjectId) {
      setMessages([])
      return
    }
    ipc.getMessages(activeProjectId, 500).then(setMessages).catch(() => {})
  }, [activeProjectId])

  // Reload all data after full sync (restores lost data from backend)
  useEffect(() => {
    const unsub = ipc.onSyncStatusUpdate((data: { type: string }) => {
      if (data.type === 'full-sync-completed') {
        ipc.getProjects().then((p) => {
          setProjects(p)
          if (p.length > 0 && !activeProjectId) {
            setActiveProjectId(p[0].id)
          }
        }).catch(() => {})
        if (activeProjectId) {
          ipc.getMessages(activeProjectId, 500).then(setMessages).catch(() => {})
        }
      }
    })
    return () => unsub()
  }, [activeProjectId])

  // Listen for real-time message updates
  useEffect(() => {
    const unsubMsg = ipc.onMessageUpdate((msg: ChatMessage & { _deleted?: boolean }) => {
      if (msg.projectId !== activeProjectId) return

      // Handle deleted messages (e.g. on retry)
      if (msg._deleted) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id))
        return
      }

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = msg
          return updated
        }
        return [...prev, msg]
      })
    })

    const unsubAgent = ipc.onAgentStatusUpdate((data) => {
      if (data.projectId !== activeProjectId) return
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== data.projectId) return p
          return {
            ...p,
            agents: p.agents.map((a) =>
              a.id === data.agentId
                ? {
                    ...a,
                    status: data.status as ProjectAgent['status'],
                    currentTool: data.currentTool,
                    stopped: data.stopped ?? a.stopped,
                  }
                : a
            ),
          }
        })
      )
    })

    return () => { unsubMsg(); unsubAgent() }
  }, [activeProjectId])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  const createProject = useCallback(async (name: string, description?: string) => {
    const project = await ipc.createProject({ name, description })
    setProjects((prev) => [project, ...prev])
    setActiveProjectId(project.id)
    return project
  }, [ipc])

  const updateProject = useCallback(async (id: string, updates: { name?: string; description?: string; metadata?: Record<string, string> }) => {
    const updated = await ipc.updateProject({ id, ...updates })
    setProjects((prev) => prev.map((p) => {
      if (p.id !== id) return p
      // Merge: keep local agents/state, only update metadata from backend
      return { ...p, ...updated, agents: updated.agents?.length ? updated.agents : p.agents }
    }))
    return updated
  }, [ipc])

  const deleteProject = useCallback(async (id: string) => {
    await ipc.deleteProject(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (activeProjectId === id) {
      setActiveProjectId(projects.find((p) => p.id !== id)?.id ?? null)
    }
  }, [ipc, activeProjectId, projects])

  const addAgent = useCallback(async (data: { name: string; title?: string; systemPrompt: string; color: string; avatar?: string; model?: string; effort?: string }) => {
    if (!activeProjectId) return
    const agent = await ipc.addAgent(activeProjectId, data)
    setProjects((prev) =>
      prev.map((p) => p.id === activeProjectId ? { ...p, agents: [...p.agents, agent] } : p)
    )
  }, [ipc, activeProjectId])

  const addGlobalAgentToProject = useCallback(async (globalAgentId: string) => {
    if (!activeProjectId) return
    const agent = await ipc.addGlobalAgentToProject(activeProjectId, globalAgentId)
    setProjects((prev) =>
      prev.map((p) => p.id === activeProjectId ? { ...p, agents: [...p.agents, agent] } : p)
    )
  }, [ipc, activeProjectId])

  const removeAgent = useCallback(async (agentId: string) => {
    if (!activeProjectId) return
    await ipc.removeAgent(activeProjectId, agentId)
    setProjects((prev) =>
      prev.map((p) => p.id === activeProjectId ? { ...p, agents: p.agents.filter((a) => a.id !== agentId) } : p)
    )
  }, [ipc, activeProjectId])

  const sendMessage = useCallback(async (content: string, replyToLocalId?: string, attachments?: MessageAttachment[]) => {
    if (!activeProjectId) return
    await ipc.sendMessage(activeProjectId, content, replyToLocalId, attachments)
  }, [ipc, activeProjectId])

  const deleteMessage = useCallback(async (messageId: string) => {
    await ipc.deleteMessage(messageId)
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [ipc])

  const retryMessage = useCallback(async (messageId: string) => {
    await ipc.retryMessage(messageId)
  }, [ipc])

  const stopAgent = useCallback(async (messageId: string) => {
    await ipc.stopAgent(messageId)
  }, [ipc])

  /**
   * Per-agent kill switch. Stopping kills that agent's running Claude process and blocks any new
   * run (chat + autonomous loop) until it is resumed. Other agents keep going.
   */
  const setAgentStopped = useCallback(async (agentId: string, stopped: boolean) => {
    if (!activeProjectId) return
    // Optimistic — the main process also broadcasts an AGENT_STATUS_UPDATE.
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== activeProjectId
          ? p
          : { ...p, agents: p.agents.map((a) => (a.id === agentId ? { ...a, stopped, status: stopped ? 'idle' : a.status, currentTool: stopped ? undefined : a.currentTool } : a)) }
      )
    )
    await ipc.setAgentStopped(activeProjectId, agentId, stopped)
  }, [ipc, activeProjectId])

  const reloadProjects = useCallback(async () => {
    const p = await ipc.getProjects()
    setProjects(p)
  }, [ipc])

  return {
    projects,
    activeProject,
    activeProjectId,
    messages,
    loading,
    setActiveProjectId,
    createProject,
    updateProject,
    deleteProject,
    addAgent,
    addGlobalAgentToProject,
    removeAgent,
    sendMessage,
    deleteMessage,
    retryMessage,
    stopAgent,
    setAgentStopped,
    reloadProjects,
  }
}

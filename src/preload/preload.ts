import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type { OrchestratorState, LogEntry, StoredSettings, Project, ProjectAgent, GlobalAgent, ChatMessage, SyncStatus, Ticket, TicketComment, TicketGroups, ProjectDocument, AgentMemory, ProjectGoal, GoalRunLog, GoalPhaseUpdate, Rating, MessageAttachment } from '@shared/types'
import type { ImportResult } from '@shared/ticketImport'

const api = {
  getState: (): Promise<OrchestratorState> =>
    ipcRenderer.invoke(IpcChannel.GET_STATE),

  connect: (url: string, token: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.CONNECT, { backendUrl: url, token }),

  disconnect: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.DISCONNECT),

  getLogs: (): Promise<LogEntry[]> =>
    ipcRenderer.invoke(IpcChannel.GET_LOGS),

  getSettings: (): Promise<StoredSettings> =>
    ipcRenderer.invoke(IpcChannel.GET_SETTINGS),

  saveSettings: (settings: Partial<StoredSettings>): Promise<StoredSettings> =>
    ipcRenderer.invoke(IpcChannel.SAVE_SETTINGS, settings),

  minimizeToTray: (): void =>
    ipcRenderer.send(IpcChannel.MINIMIZE_TO_TRAY),

  onStateUpdate: (callback: (state: OrchestratorState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: OrchestratorState) => callback(state)
    ipcRenderer.on(IpcChannel.STATE_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IpcChannel.STATE_UPDATE, listener) }
  },

  onLogUpdate: (callback: (entry: LogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry)
    ipcRenderer.on(IpcChannel.LOG_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IpcChannel.LOG_UPDATE, listener) }
  },

  // ── Projects ────────────────────────────────────────────────────────────
  getProjects: (): Promise<Project[]> =>
    ipcRenderer.invoke(IpcChannel.GET_PROJECTS),

  createProject: (data: { name: string; description?: string }): Promise<Project> =>
    ipcRenderer.invoke(IpcChannel.CREATE_PROJECT, data),

  updateProject: (data: { id: string; name?: string; description?: string; metadata?: Record<string, string> }): Promise<Project> =>
    ipcRenderer.invoke(IpcChannel.UPDATE_PROJECT, data),

  deleteProject: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.DELETE_PROJECT, id),

  // ── Global Agents ──────────────────────────────────────────────────────
  getGlobalAgents: (): Promise<GlobalAgent[]> =>
    ipcRenderer.invoke(IpcChannel.GET_GLOBAL_AGENTS),

  createGlobalAgent: (agent: Partial<GlobalAgent>): Promise<GlobalAgent> =>
    ipcRenderer.invoke(IpcChannel.CREATE_GLOBAL_AGENT, agent),

  updateGlobalAgent: (id: string, updates: Partial<GlobalAgent>): Promise<GlobalAgent> =>
    ipcRenderer.invoke(IpcChannel.UPDATE_GLOBAL_AGENT, { id, updates }),

  deleteGlobalAgent: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.DELETE_GLOBAL_AGENT, id),

  // ── Project Agents ────────────────────────────────────────────────────
  addAgent: (projectId: string, agent: Partial<ProjectAgent>): Promise<ProjectAgent> =>
    ipcRenderer.invoke(IpcChannel.ADD_AGENT, { projectId, agent }),

  addGlobalAgentToProject: (projectId: string, globalAgentId: string): Promise<ProjectAgent> =>
    ipcRenderer.invoke(IpcChannel.ADD_AGENT, { projectId, globalAgentId }),

  removeAgent: (projectId: string, agentId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.REMOVE_AGENT, { projectId, agentId }),

  generateAgentPrompt: (skillDescription: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannel.GENERATE_AGENT_PROMPT, { skillDescription }),

  // ── Chat ────────────────────────────────────────────────────────────────
  sendMessage: (projectId: string, content: string, replyToLocalId?: string, attachments?: MessageAttachment[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.SEND_MESSAGE, { projectId, content, replyToLocalId, attachments }),

  saveAttachment: (messageId: string, fileName: string, mimeType: string, dataBase64: string): Promise<{ success: boolean; attachment?: MessageAttachment; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.SAVE_ATTACHMENT, { messageId, fileName, mimeType, dataBase64 }),

  getMessages: (projectId: string, limit?: number, offset?: number): Promise<ChatMessage[]> =>
    ipcRenderer.invoke(IpcChannel.GET_MESSAGES, { projectId, limit, offset }),

  deleteMessage: (messageId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.DELETE_MESSAGE, { messageId }),

  retryMessage: (messageId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.RETRY_MESSAGE, { messageId }),

  stopAgent: (messageId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IpcChannel.STOP_AGENT_CHAT, { messageId }),

  /** Per-agent kill switch: stops (or resumes) one agent without touching the others. */
  setAgentStopped: (projectId: string, agentId: string, stopped: boolean): Promise<{ success: boolean; killed: number }> =>
    ipcRenderer.invoke(IpcChannel.SET_AGENT_STOPPED, { projectId, agentId, stopped }),

  // ── Tickets ─────────────────────────────────────────────────────────────
  tickets: {
    getAll: (projectId: string): Promise<TicketGroups> =>
      ipcRenderer.invoke(IpcChannel.GET_TICKETS, { projectId }),

    create: (projectId: string, title: string, description?: string, assignedAgentLocalId?: string, assignedAgentName?: string, category?: string, attachments?: MessageAttachment[]): Promise<Ticket> =>
      ipcRenderer.invoke(IpcChannel.CREATE_TICKET, { projectId, title, description, assignedAgentLocalId, assignedAgentName, category, attachments }),

    update: (ticketId: string, updates: Partial<Ticket>): Promise<Ticket> =>
      ipcRenderer.invoke(IpcChannel.UPDATE_TICKET, { ticketId, updates }),

    delete: (ticketId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.DELETE_TICKET, { ticketId }),

    addComment: (ticketId: string, projectId: string, content: string): Promise<TicketComment> =>
      ipcRenderer.invoke(IpcChannel.ADD_TICKET_COMMENT, { ticketId, projectId, content }),

    importFromJson: (projectId: string, content?: string): Promise<ImportResult> =>
      ipcRenderer.invoke(IpcChannel.IMPORT_TICKETS, { projectId, content }),

    onUpdate: (callback: (data: { type: string; ticket?: Ticket; ticketId?: string; comment?: TicketComment }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { type: string; ticket?: Ticket; ticketId?: string; comment?: TicketComment }) => callback(data)
      ipcRenderer.on(IpcChannel.TICKET_UPDATE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.TICKET_UPDATE, listener) }
    },
  },

  // ── Documents ──────────────────────────────────────────────────────────
  documents: {
    getAll: (projectId: string): Promise<ProjectDocument[]> =>
      ipcRenderer.invoke(IpcChannel.GET_DOCUMENTS, { projectId }),

    create: (projectId: string, title: string, content: string): Promise<ProjectDocument> =>
      ipcRenderer.invoke(IpcChannel.CREATE_DOCUMENT, { projectId, title, content }),

    update: (documentId: string, updates: { title?: string; content?: string }): Promise<ProjectDocument> =>
      ipcRenderer.invoke(IpcChannel.UPDATE_DOCUMENT, { documentId, updates }),

    delete: (documentId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.DELETE_DOCUMENT, { documentId }),

    onUpdate: (callback: (data: { type: string; document?: ProjectDocument; documentId?: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { type: string; document?: ProjectDocument; documentId?: string }) => callback(data)
      ipcRenderer.on(IpcChannel.DOCUMENT_UPDATE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.DOCUMENT_UPDATE, listener) }
    },
  },

  // ── Goals (Autonomous Loop) ─────────────────────────────────────────────
  goals: {
    start: (projectId: string, description: string, selectedAgentIds?: string[]): Promise<ProjectGoal> =>
      ipcRenderer.invoke(IpcChannel.START_GOAL, { projectId, description, selectedAgentIds }),

    startFromTickets: (projectId: string, ticketIds: string[], selectedAgentIds?: string[]): Promise<ProjectGoal> =>
      ipcRenderer.invoke(IpcChannel.START_GOAL_FROM_TICKETS, { projectId, ticketIds, selectedAgentIds }),

    getAll: (projectId: string): Promise<ProjectGoal[]> =>
      ipcRenderer.invoke(IpcChannel.GET_GOALS, { projectId }),

    getLog: (goalId: number): Promise<GoalRunLog[]> =>
      ipcRenderer.invoke(IpcChannel.GET_GOAL_LOG, { goalId }),

    cancel: (goalId: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.CANCEL_GOAL, { goalId }),

    retry: (goalId: number): Promise<ProjectGoal | null> =>
      ipcRenderer.invoke(IpcChannel.RETRY_GOAL, { goalId }),

    onPhaseUpdate: (callback: (data: GoalPhaseUpdate) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: GoalPhaseUpdate) => callback(data)
      ipcRenderer.on(IpcChannel.GOAL_PHASE_UPDATE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.GOAL_PHASE_UPDATE, listener) }
    },

    onComplete: (callback: (data: { goalId: number; summary: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { goalId: number; summary: string }) => callback(data)
      ipcRenderer.on(IpcChannel.GOAL_COMPLETE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.GOAL_COMPLETE, listener) }
    },

    onFailed: (callback: (data: { goalId: number; reason: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { goalId: number; reason: string }) => callback(data)
      ipcRenderer.on(IpcChannel.GOAL_FAILED, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.GOAL_FAILED, listener) }
    },

    onGoalUpdate: (callback: (goal: ProjectGoal) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, goal: ProjectGoal) => callback(goal)
      ipcRenderer.on(IpcChannel.GOAL_STATUS_UPDATE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.GOAL_STATUS_UPDATE, listener) }
    },

    onLogEntry: (callback: (data: { goalId: number; log: GoalRunLog }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { goalId: number; log: GoalRunLog }) => callback(data)
      ipcRenderer.on(IpcChannel.GOAL_LOG_UPDATE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.GOAL_LOG_UPDATE, listener) }
    },
  },

  // ── Agent Memory ────────────────────────────────────────────────────────
  memory: {
    getAll: (globalAgentId: string): Promise<AgentMemory[]> =>
      ipcRenderer.invoke(IpcChannel.GET_AGENT_MEMORIES, { globalAgentId }),

    save: (globalAgentId: string, projectId: string | null, key: string, value: string, importance: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.SAVE_AGENT_MEMORY, { globalAgentId, projectId, key, value, importance }),

    delete: (memoryId: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.DELETE_AGENT_MEMORY, { memoryId }),

    clearAll: (globalAgentId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.CLEAR_AGENT_MEMORIES, { globalAgentId }),
  },

  // ── Email Verification ──────────────────────────────────────────────────
  emailVerification: {
    sendCode: (email: string): Promise<{ success: boolean; verificationId?: string; error?: string }> =>
      ipcRenderer.invoke(IpcChannel.SEND_EMAIL_VERIFICATION, { email }),

    verifyCode: (verificationId: string, code: string): Promise<{ success: boolean; email?: string; error?: string }> =>
      ipcRenderer.invoke(IpcChannel.VERIFY_EMAIL_CODE, { verificationId, code }),

    resendCode: (verificationId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannel.RESEND_EMAIL_VERIFICATION, { verificationId }),
  },

  // ── Ratings (Bewertungssystem) ───────────────────────────────────────────
  ratings: {
    submit: (data: {
      projectId: string
      period: string
      stayType: string
      impression: string
      categories: string[]
      facilitiesInside?: string[]
      facilitiesNearby?: string[]
      title: string
      firstName: string
      email: string
      consent: boolean
      demographics?: { sleepType?: string | null; rank?: string | null; ageGroup?: string | null; familyStatus?: string | null }
    }): Promise<{ success: boolean; ratingId?: string; errors?: string[] }> =>
      ipcRenderer.invoke(IpcChannel.SUBMIT_RATING, data),

    verify: (ratingId: string, code: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannel.VERIFY_RATING, { ratingId, code }),

    resendVerification: (ratingId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannel.RESEND_VERIFICATION, { ratingId }),

    getAll: (projectId: string, status?: string): Promise<Rating[]> =>
      ipcRenderer.invoke(IpcChannel.GET_RATINGS, { projectId, status }),

    get: (ratingId: string): Promise<Rating | null> =>
      ipcRenderer.invoke(IpcChannel.GET_RATING, { ratingId }),

    delete: (ratingId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannel.DELETE_RATING, { ratingId }),

    onUpdate: (callback: (data: { type: string; rating?: Rating; ratingId?: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { type: string; rating?: Rating; ratingId?: string }) => callback(data)
      ipcRenderer.on(IpcChannel.RATING_UPDATE, listener)
      return () => { ipcRenderer.removeListener(IpcChannel.RATING_UPDATE, listener) }
    },
  },

  // ── File picker ─────────────────────────────────────────────────────────
  pickAndReadFile: (filters?: { name: string; extensions: string[] }[]): Promise<{ canceled: boolean; fileName?: string; content?: string }> =>
    ipcRenderer.invoke(IpcChannel.PICK_AND_READ_FILE, { filters }),

  // ── Export ──────────────────────────────────────────────────────────────
  exportPdf: (title: string, htmlContent: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.EXPORT_PDF, { title, htmlContent }),

  // ── Sync ────────────────────────────────────────────────────────────────
  getSyncStatus: (): Promise<SyncStatus> =>
    ipcRenderer.invoke(IpcChannel.GET_SYNC_STATUS),

  triggerFullSync: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.TRIGGER_FULL_SYNC),

  // ── Events (main → renderer) ───────────────────────────────────────────
  onMessageUpdate: (callback: (msg: ChatMessage) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: ChatMessage) => callback(msg)
    ipcRenderer.on(IpcChannel.CHAT_MESSAGE_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IpcChannel.CHAT_MESSAGE_UPDATE, listener) }
  },

  onAgentStatusUpdate: (callback: (data: { projectId: string; agentId: string; status: string; currentTool?: string; stopped?: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { projectId: string; agentId: string; status: string; currentTool?: string; stopped?: boolean }) => callback(data)
    ipcRenderer.on(IpcChannel.AGENT_STATUS_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IpcChannel.AGENT_STATUS_UPDATE, listener) }
  },

  onSyncStatusUpdate: (callback: (data: Record<string, unknown>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data)
    ipcRenderer.on(IpcChannel.SYNC_STATUS_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IpcChannel.SYNC_STATUS_UPDATE, listener) }
  },
}

export type OrchestratorApi = typeof api

contextBridge.exposeInMainWorld('orchestrator', api)

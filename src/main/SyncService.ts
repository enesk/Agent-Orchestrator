import { EventEmitter } from 'events'
import https from 'https'
import axios, { AxiosInstance } from 'axios'
import { log } from './Logger'
import { LocalDatabase } from './LocalDatabase'
import type { ChatMessage, Project, ProjectAgent, Ticket, TicketComment, ProjectDocument } from '@shared/types'

export class SyncService extends EventEmitter {
  private db: LocalDatabase
  private api!: AxiosInstance
  private backendUrl: string = ''
  private token: string = ''
  private syncInterval: NodeJS.Timeout | null = null
  private connectivityInterval: NodeJS.Timeout | null = null
  private _isSyncing: boolean = false
  private _isOnline: boolean = false
  private _lastSyncAt: Date | null = null

  constructor(db: LocalDatabase) {
    super()
    this.db = db
  }

  get isOnline(): boolean { return this._isOnline }
  get isSyncing(): boolean { return this._isSyncing }
  get lastSyncAt(): Date | null { return this._lastSyncAt }

  initialize(backendUrl: string, token: string): void {
    // Extract host:port from the backend URL (strip protocol, path like /ws, /app/*)
    let host = backendUrl
      .replace(/^wss?:\/\//, '')
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '') // remove any path (e.g. /ws, /app/key)

    this.backendUrl = `https://${host}`
    this.token = token

    this.api = axios.create({
      baseURL: `${this.backendUrl}/api/v1`,
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    })

    log('info', `SyncService initialized: ${this.backendUrl}`)

    // Cleanup old messages
    const deleted = this.db.deleteOldMessages(90)
    if (deleted > 0) {
      log('info', `Cleaned up ${deleted} old synced messages`)
    }

    // Start connectivity check every 10 seconds
    this.connectivityInterval = setInterval(() => this.checkConnectivity(), 10000)

    // Start sync loop every 30 seconds
    this.syncInterval = setInterval(() => this.processSyncQueue(), 30000)

    // Initial check after 3 seconds
    setTimeout(() => this.checkConnectivity(), 3000)
  }

  async checkConnectivity(): Promise<void> {
    const wasOnline = this._isOnline

    try {
      await this.api.get('/ping', { timeout: 3000 })
      this._isOnline = true
    } catch (err) {
      this._isOnline = false
      log('warn', `[Sync] Ping failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (wasOnline !== this._isOnline) {
      log('info', `Connectivity changed: ${this._isOnline ? 'online' : 'offline'}`)
      this.emit('connectivity-changed', this._isOnline)

      if (this._isOnline) {
        // Came online, sync immediately
        this.processSyncQueue()
      }
    }
  }

  async processSyncQueue(): Promise<void> {
    if (this._isSyncing || !this._isOnline) return

    this._isSyncing = true
    let synced = 0
    let failed = 0

    try {
      const items = this.db.getPendingSyncItems(50)
      if (items.length > 0) {
        log('info', `[Sync] Processing ${items.length} pending items`)
      }

      for (const item of items) {
        if (item.attempts >= 5) continue

        try {
          log('info', `[Sync] Syncing ${item.entityType}/${item.action} (id: ${item.entityId})`)
          await this.executeSyncItem(item.entityType, item.action, item.payload)
          this.db.removeSyncQueueItem(item.id)

          // Mark entity as synced
          if (item.entityType === 'message') {
            this.db.markMessageSynced(item.entityId)
          } else if (item.entityType === 'project') {
            // The remote ID comes from the API response
          } else if (item.entityType === 'agent') {
            this.db.markAgentSynced(item.entityId)
          } else if (item.entityType === 'ticket') {
            this.db.markTicketSynced(item.entityId)
          } else if (item.entityType === 'ticket_comment') {
            this.db.markCommentSynced(item.entityId)
          } else if (item.entityType === 'document') {
            this.db.markDocumentSynced(item.entityId)
          }

          synced++
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          log('warn', `[Sync] Failed ${item.entityType}/${item.action}: ${errorMsg}`)
          this.db.incrementSyncAttempts(item.id, errorMsg)
          failed++
        }
      }

      if (synced > 0 || failed > 0) {
        this._lastSyncAt = new Date()
        this.emit('sync-completed', {
          synced,
          failed,
          timestamp: this._lastSyncAt.toISOString(),
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log('error', `Sync queue processing error: ${errorMsg}`)
      this.emit('sync-error', errorMsg)
    } finally {
      this._isSyncing = false
    }
  }

  private async executeSyncItem(entityType: string, action: string, payload: Record<string, unknown>): Promise<void> {
    switch (entityType) {
      case 'project': {
        if (action === 'create') {
          const res = await this.api.post('/chat-projects', {
            local_id: payload.id,
            name: payload.name,
            description: payload.description,
            metadata: payload.metadata,
          })
          if (res.data.project?.id) {
            this.db.markProjectSynced(payload.id as string, res.data.project.id)
          }
        } else if (action === 'update') {
          const project = this.db.getProject(payload.id as string)
          if (project?.remoteId) {
            await this.api.put(`/chat-projects/${project.remoteId}`, {
              name: payload.name,
              description: payload.description,
              metadata: payload.metadata,
            })
          }
        } else if (action === 'delete') {
          const project = this.db.getProject(payload.id as string)
          if (project?.remoteId) {
            await this.api.delete(`/chat-projects/${project.remoteId}`)
          }
        }
        break
      }
      case 'agent': {
        if (action === 'create') {
          const project = this.db.getProject(payload.projectId as string)
          if (project?.remoteId) {
            await this.api.post(`/chat-projects/${project.remoteId}/agents`, {
              local_id: payload.id,
              name: payload.name,
              title: payload.title,
              mention_key: payload.mentionKey,
              system_prompt: payload.systemPrompt,
              color: payload.color,
              avatar: payload.avatar,
              sort_order: payload.sortOrder,
            })
          }
        } else if (action === 'delete') {
          const project = this.db.getProject(payload.projectId as string)
          if (project?.remoteId) {
            await this.api.delete(`/chat-projects/${project.remoteId}/agents/${payload.id}`)
          }
        }
        break
      }
      case 'message': {
        if (action === 'create') {
          const project = this.db.getProject(payload.projectId as string)
          if (project?.remoteId) {
            await this.api.post(`/chat-projects/${project.remoteId}/messages`, {
              local_id: payload.id,
              role: payload.role,
              content: payload.content,
              agent_local_id: payload.agentLocalId,
              agent_name: payload.agentName,
              mentions: payload.mentions,
              reply_to_local_id: payload.replyToLocalId,
              session_id: payload.sessionId,
              status: payload.status === 'sending' || payload.status === 'streaming' ? 'done' : payload.status,
              attachments: payload.attachments ?? null,
              client_timestamp: payload.clientTimestamp,
            })
          }
        }
        break
      }
      case 'ticket': {
        const project = this.db.getProject(payload.projectId as string)
        if (!project?.remoteId) break

        if (action === 'create') {
          await this.api.post(`/chat-projects/${project.remoteId}/tickets`, {
            local_id: payload.id,
            title: payload.title,
            description: payload.description,
            status: payload.status,
            assigned_agent_local_id: payload.assignedAgentLocalId,
            assigned_agent_name: payload.assignedAgentName,
            sort_order: payload.sortOrder,
          })
        } else if (action === 'update') {
          // Find remote ticket by local_id
          const ticketId = payload.id as string
          const ticket = this.db.getTicket(ticketId)
          if (ticket) {
            await this.api.put(`/chat-projects/${project.remoteId}/tickets/${ticketId}`, {
              title: payload.title,
              description: payload.description,
              status: payload.status,
              assigned_agent_local_id: payload.assignedAgentLocalId,
              assigned_agent_name: payload.assignedAgentName,
              sort_order: payload.sortOrder,
            })
          }
        } else if (action === 'delete') {
          await this.api.delete(`/chat-projects/${project.remoteId}/tickets/${payload.id}`)
        }
        break
      }
      case 'ticket_comment': {
        const project = this.db.getProject(payload.projectId as string)
        if (!project?.remoteId) break

        if (action === 'create') {
          await this.api.post(`/chat-projects/${project.remoteId}/tickets/${payload.ticketId}/comments`, {
            local_id: payload.id,
            author_type: payload.authorType,
            agent_local_id: payload.agentLocalId,
            agent_name: payload.agentName,
            content: payload.content,
            client_timestamp: payload.clientTimestamp,
          })
        }
        break
      }
      case 'document': {
        const project = this.db.getProject(payload.projectId as string)
        if (!project?.remoteId) break

        if (action === 'create') {
          await this.api.post(`/chat-projects/${project.remoteId}/documents`, {
            local_id: payload.id,
            title: payload.title,
            content: payload.content,
            created_by_agent_id: payload.createdByAgentId,
            created_by_agent_name: payload.createdByAgentName,
          })
        } else if (action === 'update') {
          await this.api.put(`/chat-projects/${project.remoteId}/documents/${payload.id}`, {
            title: payload.title,
            content: payload.content,
            updated_by_agent_id: payload.updatedByAgentId,
            updated_by_agent_name: payload.updatedByAgentName,
          })
        } else if (action === 'delete') {
          await this.api.delete(`/chat-projects/${project.remoteId}/documents/${payload.id}`)
        }
        break
      }
    }
  }

  async fetchRemoteMessages(projectId: string, since?: string): Promise<ChatMessage[]> {
    const project = this.db.getProject(projectId)
    if (!project?.remoteId || !this._isOnline) return []

    try {
      const params: Record<string, string> = { limit: '500' }
      if (since) params.since = since

      const res = await this.api.get(`/chat-projects/${project.remoteId}/messages`, { params })
      const remoteMessages = res.data.messages as Record<string, unknown>[]
      const newMessages: ChatMessage[] = []

      for (const rm of remoteMessages) {
        // Check if we already have this message locally
        const existing = this.db.getMessageById(rm.local_id as string)
        if (!existing) {
          const msg: ChatMessage = {
            id: rm.local_id as string,
            projectId,
            role: rm.role as 'user' | 'agent',
            agentLocalId: rm.agent_local_id as string | undefined,
            agentName: rm.agent_name as string | undefined,
            content: rm.content as string,
            mentions: (rm.mentions as string[]) ?? [],
            replyToLocalId: rm.reply_to_local_id as string | undefined,
            sessionId: rm.session_id as string | undefined,
            status: rm.status as ChatMessage['status'],
            clientTimestamp: rm.client_timestamp as string,
            synced: true,
          }
          this.db.saveMessage(msg)
          newMessages.push(msg)
        }
      }

      return newMessages
    } catch (err) {
      log('error', `Failed to fetch remote messages: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }

  async fetchRemoteTickets(projectId: string): Promise<Ticket[]> {
    const project = this.db.getProject(projectId)
    if (!project?.remoteId || !this._isOnline) return []

    try {
      const res = await this.api.get(`/chat-projects/${project.remoteId}/tickets`)
      const raw = res.data.tickets ?? res.data
      const remoteTickets = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[]
      const newTickets: Ticket[] = []

      for (const rt of remoteTickets) {
        const existing = this.db.getTicket(rt.local_id as string)
        if (!existing) {
          const ticket: Ticket = {
            id: rt.local_id as string,
            projectId,
            ticketNumber: rt.ticket_number as number,
            title: rt.title as string,
            description: rt.description as string | undefined,
            status: rt.status as Ticket['status'],
            category: rt.category as Ticket['category'] | undefined,
            assignedAgentLocalId: rt.assigned_agent_local_id as string | undefined,
            assignedAgentName: rt.assigned_agent_name as string | undefined,
            sortOrder: rt.sort_order as number ?? 0,
            createdAt: rt.created_at as string,
            updatedAt: rt.updated_at as string,
            synced: true,
            comments: [],
          }
          this.db.saveTicket(ticket)
          newTickets.push(ticket)

          // Sync comments for this ticket
          const comments = (rt.comments as Record<string, unknown>[]) ?? []
          for (const rc of comments) {
            const comment: TicketComment = {
              id: rc.local_id as string,
              ticketId: ticket.id,
              projectId,
              authorType: rc.author_type as 'user' | 'agent',
              agentLocalId: rc.agent_local_id as string | undefined,
              agentName: rc.agent_name as string | undefined,
              content: rc.content as string,
              clientTimestamp: rc.client_timestamp as string,
              synced: true,
            }
            this.db.saveComment(comment)
          }
        }
      }

      return newTickets
    } catch (err) {
      log('error', `Failed to fetch remote tickets: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }

  async fullSync(): Promise<void> {
    if (!this._isOnline) {
      this.emit('sync-error', 'Cannot sync while offline')
      return
    }

    log('info', 'Starting full sync...')

    try {
      // 1. Fetch all projects from server
      const res = await this.api.get('/chat-projects')
      const remoteProjects = res.data.projects as Record<string, unknown>[]

      for (const rp of remoteProjects) {
        const localProject = this.db.getProject(rp.local_id as string)
        if (!localProject) {
          // New project from remote
          const project: Project = {
            id: rp.local_id as string,
            name: rp.name as string,
            description: rp.description as string | undefined,
            metadata: rp.metadata as Record<string, string> | undefined,
            createdAt: rp.created_at as string,
            updatedAt: rp.updated_at as string,
            agents: [],
            synced: true,
            remoteId: rp.id as number,
          }
          this.db.saveProject(project)
        } else {
          // Existing project - update remote_id and restore any missing data from backend
          if (!localProject.remoteId) {
            this.db.markProjectSynced(localProject.id, rp.id as number)
          }
          // Restore metadata from backend if locally missing
          const remoteMetadata = rp.metadata as Record<string, string> | undefined
          if (remoteMetadata && Object.keys(remoteMetadata).length > 0 && (!localProject.metadata || Object.keys(localProject.metadata).length === 0)) {
            const restored: Project = {
              ...localProject,
              metadata: remoteMetadata,
              updatedAt: localProject.updatedAt,
              synced: true,
              remoteId: localProject.remoteId ?? (rp.id as number),
            }
            this.db.saveProject(restored)
          }
        }

        // Always sync agents from remote (re-creates any that were lost).
        // The backend payload carries no `model` / `global_agent_id`, so anything it does not
        // know about MUST be carried over from the local row — otherwise this full sync (which
        // runs on every startup) would overwrite the user's per-agent model with NULL and every
        // agent would silently fall back to DEFAULT_AGENT_MODEL.
        const projectId = rp.local_id as string
        const agents = (rp.agents as Record<string, unknown>[]) ?? []
        const localAgents = this.db.getAgentsByProject(projectId)
        for (const ra of agents) {
          const localId = ra.local_id as string
          const localAgent = localAgents.find((a) => a.id === localId)
          const remoteModel = (ra.model as string | undefined)?.trim()
          const agent: ProjectAgent = {
            id: localId,
            projectId,
            globalAgentId: localAgent?.globalAgentId,
            name: ra.name as string,
            title: (ra.title as string | undefined) ?? localAgent?.title,
            mentionKey: ra.mention_key as string,
            systemPrompt: ra.system_prompt as string,
            color: ra.color as string,
            avatar: (ra.avatar as string | undefined) ?? localAgent?.avatar,
            // Local model wins — it is configured in this app and not (yet) synced to the backend.
            model: localAgent?.model ?? remoteModel,
            // The backend has no notion of effort at all, so the local value is the only source.
            effort: localAgent?.effort,
            sortOrder: ra.sort_order as number ?? 0,
            status: 'idle',
            stopped: localAgent?.stopped,
          }
          this.db.saveAgent(projectId, agent)
        }
      }

      // 2. Fetch messages and tickets for each project (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const allProjects = this.db.getAllProjects()
      for (const project of allProjects) {
        await this.fetchRemoteMessages(project.id, thirtyDaysAgo)
        await this.fetchRemoteTickets(project.id)
      }

      // 3. Process pending sync queue
      await this.processSyncQueue()

      // 4. Clean up permanently failed items (5+ attempts)
      const cleared = this.db.clearFailedSyncItems()
      if (cleared > 0) {
        log('info', `[Sync] Cleared ${cleared} permanently failed sync items`)
      }

      this._lastSyncAt = new Date()
      log('info', 'Full sync completed')
      this.emit('full-sync-completed')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log('error', `Full sync failed: ${errorMsg}`)
      this.emit('sync-error', errorMsg)
    }
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    if (this.connectivityInterval) {
      clearInterval(this.connectivityInterval)
      this.connectivityInterval = null
    }
    log('info', 'SyncService stopped')
  }
}

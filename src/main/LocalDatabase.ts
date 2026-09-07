import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { log } from './Logger'
import type { Project, ProjectAgent, GlobalAgent, ChatMessage, SyncQueueItem, Ticket, TicketComment, ProjectDocument, AgentMemory, ProjectGoal, GoalRunLog, GoalStatus, GoalMode, GoalPhase, GoalErrorType, GoalCheckpoint, Rating, RatingCategoryScore } from '@shared/types'
import type { ImportPlan } from '@shared/ticketImport'

const SCHEMA_VERSION = 25

export class LocalDatabase {
  private db!: Database.Database

  initialize(): void {
    const dbPath = path.join(app.getPath('userData'), 'orchestrator.db')
    log('info', `Opening SQLite database: ${dbPath}`)

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.runMigrations()
    log('info', 'LocalDatabase initialized')
  }

  close(): void {
    this.db?.close()
  }

  // ── Schema Management ──────────────────────────────────────────────────────

  private getCurrentSchemaVersion(): number {
    try {
      const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
      return row.user_version
    } catch {
      return 0
    }
  }

  private setSchemaVersion(version: number): void {
    this.db.exec(`PRAGMA user_version = ${version}`)
  }

  private runMigrations(): void {
    const current = this.getCurrentSchemaVersion()
    log('info', `Schema version: ${current}, target: ${SCHEMA_VERSION}`)

    if (current < 1) {
      this.migrateToV1()
    }
    if (current < 2) {
      this.migrateToV2()
    }
    if (current < 3) {
      this.migrateToV3()
    }
    if (current < 4) {
      this.migrateToV4()
    }
    if (current < 5) {
      this.migrateToV5()
    }
    if (current < 6) {
      this.migrateToV6()
    }
    if (current < 7) {
      this.migrateToV7()
    }
    if (current < 8) {
      this.migrateToV8()
    }
    if (current < 9) {
      this.migrateToV9()
    }
    if (current < 10) {
      this.migrateToV10()
    }
    if (current < 11) {
      this.migrateToV11()
    }
    if (current < 12) {
      this.migrateToV12()
    }
    if (current < 13) {
      this.migrateToV13()
    }
    if (current < 14) {
      this.migrateToV14()
    }
    if (current < 15) {
      this.migrateToV15()
    }
    if (current < 16) {
      this.migrateToV16()
    }
    if (current < 17) {
      this.migrateToV17()
    }
    if (current < 18) {
      this.migrateToV18()
    }
    if (current < 19) {
      this.migrateToV19()
    }
    if (current < 20) {
      this.migrateToV20()
    }
    if (current < 21) {
      this.migrateToV21()
    }
    if (current < 22) {
      this.migrateToV22()
    }
    if (current < 23) {
      this.migrateToV23()
    }
    if (current < 24) {
      this.migrateToV24()
    }
    if (current < 25) {
      this.migrateToV25()
    }

    this.setSchemaVersion(SCHEMA_VERSION)
  }

  private migrateToV1(): void {
    log('info', 'Running migration to schema v1...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        remote_id INTEGER
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_agents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mention_key TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        color TEXT NOT NULL,
        avatar TEXT,
        sort_order INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        role TEXT NOT NULL,
        agent_local_id TEXT,
        agent_name TEXT,
        content TEXT NOT NULL,
        mentions TEXT,
        reply_to_local_id TEXT,
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'done',
        client_timestamp TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        sync_attempts INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_project_ts ON chat_messages(project_id, client_timestamp)
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      )
    `)

    log('info', 'Migration to schema v1 completed')
  }

  private migrateToV2(): void {
    log('info', 'Running migration to schema v2 (tickets)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        assigned_agent_local_id TEXT,
        assigned_agent_name TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        author_type TEXT NOT NULL,
        agent_local_id TEXT,
        agent_name TEXT,
        content TEXT NOT NULL,
        client_timestamp TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tickets_project_status ON tickets(project_id, status)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tickets_project_sort ON tickets(project_id, sort_order)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_ts ON ticket_comments(ticket_id, client_timestamp)
    `)

    log('info', 'Migration to schema v2 completed')
  }

  private migrateToV3(): void {
    log('info', 'Running migration to schema v3 (ticket_number)...')

    // Add ticket_number column (default 0, will be set on creation)
    try {
      this.db.exec('ALTER TABLE tickets ADD COLUMN ticket_number INTEGER DEFAULT 0')
    } catch {
      // Column may already exist
    }

    // Backfill ticket numbers for existing tickets grouped by project
    const projects = this.db.prepare('SELECT DISTINCT project_id FROM tickets').all() as { project_id: string }[]
    for (const { project_id } of projects) {
      const tickets = this.db.prepare(
        'SELECT id FROM tickets WHERE project_id = ? ORDER BY created_at ASC'
      ).all(project_id) as { id: string }[]
      tickets.forEach((t, i) => {
        this.db.prepare('UPDATE tickets SET ticket_number = ? WHERE id = ?').run(i + 1, t.id)
      })
    }

    log('info', 'Migration to schema v3 completed')
  }

  private migrateToV4(): void {
    log('info', 'Running migration to schema v4 (ticket category)...')

    try {
      this.db.exec('ALTER TABLE tickets ADD COLUMN category TEXT')
    } catch {
      // Column may already exist
    }

    log('info', 'Migration to schema v4 completed')
  }

  private migrateToV5(): void {
    log('info', 'Running migration to schema v5 (agent title)...')

    try {
      this.db.exec('ALTER TABLE project_agents ADD COLUMN title TEXT')
    } catch {
      // Column may already exist
    }

    log('info', 'Migration to schema v5 completed')
  }

  private migrateToV6(): void {
    log('info', 'Running migration to schema v6 (project metadata)...')

    try {
      this.db.exec('ALTER TABLE projects ADD COLUMN metadata TEXT')
    } catch {
      // Column may already exist
    }

    log('info', 'Migration to schema v6 completed')
  }

  private migrateToV7(): void {
    log('info', 'Running migration to schema v7 (project documents)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        created_by_agent_id TEXT,
        created_by_agent_name TEXT,
        updated_by_agent_id TEXT,
        updated_by_agent_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_project ON project_documents(project_id)
    `)

    log('info', 'Migration to schema v7 completed')
  }

  private migrateToV8(): void {
    log('info', 'Running migration to schema v8 (thinking_content)...')
    try {
      this.db.exec('ALTER TABLE chat_messages ADD COLUMN thinking_content TEXT')
    } catch {
      // Column may already exist
    }
    log('info', 'Migration to schema v8 completed')
  }

  private migrateToV9(): void {
    log('info', 'Running migration to schema v9 (global_agents)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS global_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT,
        mention_key TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        color TEXT NOT NULL,
        avatar TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // Add global_agent_id reference to project_agents
    try {
      this.db.exec('ALTER TABLE project_agents ADD COLUMN global_agent_id TEXT')
    } catch {
      // Column may already exist
    }

    // Migrate existing project agents to global agents (deduplicate by name)
    const existing = this.db.prepare('SELECT * FROM project_agents').all() as Record<string, unknown>[]
    const seenNames = new Map<string, string>() // name → global_agent_id
    for (const row of existing) {
      const name = row.name as string
      const key = name.toLowerCase().replace(/\s+/g, '')
      if (!seenNames.has(key)) {
        const globalId = row.id as string
        const now = new Date().toISOString()
        this.db.prepare(`
          INSERT OR IGNORE INTO global_agents (id, name, title, mention_key, system_prompt, color, avatar, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(globalId, name, row.title, row.mention_key, row.system_prompt, row.color, row.avatar, now, now)
        seenNames.set(key, globalId)
      }
      // Link project agent to global agent
      const globalAgentId = seenNames.get(key)!
      this.db.prepare('UPDATE project_agents SET global_agent_id = ? WHERE id = ?').run(globalAgentId, row.id)
    }

    log('info', `Migration to schema v9 completed — created ${seenNames.size} global agents from ${existing.length} project agents`)
  }

  private migrateToV10(): void {
    log('info', 'Running migration to schema v10 (agent_memories)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        global_agent_id TEXT NOT NULL,
        project_id TEXT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        importance INTEGER DEFAULT 1,
        source TEXT DEFAULT 'agent',
        access_count INTEGER DEFAULT 0,
        last_accessed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (global_agent_id) REFERENCES global_agents(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(global_agent_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_memories_project ON agent_memories(global_agent_id, project_id)`)

    log('info', 'Migration to schema v10 completed')
  }

  private migrateToV11(): void {
    log('info', 'Running migration to schema v11 (project_goals, goal_run_log, ticket goal_id, message metadata)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        pflichtenheft_document_id TEXT,
        current_phase TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goal_run_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        step TEXT NOT NULL,
        agent_name TEXT,
        ticket_id TEXT,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'running',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES project_goals(id) ON DELETE CASCADE
      )
    `)

    try {
      this.db.exec('ALTER TABLE tickets ADD COLUMN goal_id INTEGER')
    } catch { /* Column may already exist */ }

    try {
      this.db.exec('ALTER TABLE chat_messages ADD COLUMN metadata TEXT')
    } catch { /* Column may already exist */ }

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_goals_project ON project_goals(project_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_goal_log ON goal_run_log(goal_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_goal ON tickets(goal_id)')

    log('info', 'Migration to schema v11 completed')
  }

  private migrateToV12(): void {
    log('info', 'Running migration to schema v12 (goal selected_agent_ids)...')

    try {
      this.db.exec('ALTER TABLE project_goals ADD COLUMN selected_agent_ids TEXT')
    } catch { /* Column may already exist */ }

    log('info', 'Migration to schema v12 completed')
  }

  private migrateToV13(): void {
    log('info', 'Running migration to schema v13 (goal error tracking, checkpoints)...')

    try { this.db.exec('ALTER TABLE project_goals ADD COLUMN error_type TEXT') } catch { /* exists */ }
    try { this.db.exec('ALTER TABLE project_goals ADD COLUMN error_message TEXT') } catch { /* exists */ }
    try { this.db.exec('ALTER TABLE project_goals ADD COLUMN checkpoint_data TEXT') } catch { /* exists */ }
    try { this.db.exec('ALTER TABLE project_goals ADD COLUMN completed_at TEXT') } catch { /* exists */ }
    try { this.db.exec('ALTER TABLE goal_run_log ADD COLUMN error_type TEXT') } catch { /* exists */ }

    log('info', 'Migration to schema v13 completed')
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  saveProject(project: Project): void {
    this.db.prepare(`
      INSERT INTO projects (id, name, description, metadata, created_at, updated_at, synced, remote_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at,
        synced = excluded.synced,
        remote_id = excluded.remote_id
    `).run(
      project.id,
      project.name,
      project.description ?? null,
      project.metadata ? JSON.stringify(project.metadata) : null,
      project.createdAt,
      project.updatedAt,
      project.synced ? 1 : 0,
      project.remoteId ?? null,
    )
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.rowToProject(row)
  }

  getAllProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToProject(r))
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  markProjectSynced(id: string, remoteId: number): void {
    this.db.prepare('UPDATE projects SET synced = 1, remote_id = ? WHERE id = ?').run(remoteId, id)
  }

  private rowToProject(row: Record<string, unknown>): Project {
    let metadata: Record<string, string> | undefined
    if (row.metadata && typeof row.metadata === 'string') {
      try { metadata = JSON.parse(row.metadata) } catch { /* ignore */ }
    }
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      metadata,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      synced: row.synced === 1,
      remoteId: row.remote_id as number | undefined,
      agents: [],
    }
  }

  // ── Global Agents ──────────────────────────────────────────────────────────

  getAllGlobalAgents(): GlobalAgent[] {
    const rows = this.db.prepare('SELECT * FROM global_agents ORDER BY name').all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToGlobalAgent(r))
  }

  getGlobalAgent(id: string): GlobalAgent | null {
    const row = this.db.prepare('SELECT * FROM global_agents WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToGlobalAgent(row) : null
  }

  saveGlobalAgent(agent: GlobalAgent): void {
    this.db.prepare(`
      INSERT INTO global_agents (id, name, title, mention_key, system_prompt, color, avatar, model, effort, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        mention_key = excluded.mention_key,
        system_prompt = excluded.system_prompt,
        color = excluded.color,
        avatar = excluded.avatar,
        -- Same rule as project_agents.model: never let a model-less save wipe a stored model.
        model = COALESCE(excluded.model, global_agents.model),
        effort = COALESCE(excluded.effort, global_agents.effort),
        updated_at = excluded.updated_at
    `).run(agent.id, agent.name, agent.title ?? null, agent.mentionKey, agent.systemPrompt, agent.color, agent.avatar ?? null, agent.model ?? null, agent.effort ?? null, agent.createdAt, agent.updatedAt)
  }

  deleteGlobalAgent(id: string): void {
    this.db.prepare('DELETE FROM global_agents WHERE id = ?').run(id)
    // Also remove from all projects
    this.db.prepare('DELETE FROM project_agents WHERE global_agent_id = ?').run(id)
  }

  private rowToGlobalAgent(row: Record<string, unknown>): GlobalAgent {
    return {
      id: row.id as string,
      name: row.name as string,
      title: row.title as string | undefined,
      mentionKey: row.mention_key as string,
      systemPrompt: row.system_prompt as string,
      color: row.color as string,
      avatar: row.avatar as string | undefined,
      model: (row.model as string | null) ?? undefined,
      effort: (row.effort as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  // ── Project Agents ────────────────────────────────────────────────────────

  saveAgent(projectId: string, agent: ProjectAgent): void {
    this.db.prepare(`
      INSERT INTO project_agents (id, project_id, global_agent_id, name, title, mention_key, system_prompt, color, avatar, model, effort, sort_order, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        title = excluded.title,
        mention_key = excluded.mention_key,
        system_prompt = excluded.system_prompt,
        color = excluded.color,
        avatar = excluded.avatar,
        -- The model is configured in this app and lives nowhere else. A caller that saves an
        -- agent without one (backend sync, auto-creation) must never erase the stored value —
        -- a NULL here would silently downgrade the agent to DEFAULT_AGENT_MODEL on next read.
        -- Use setAgentModel() to change it deliberately.
        model = COALESCE(excluded.model, project_agents.model),
        -- Same rule for the effort level — also local-only, also never wiped by a save without one.
        effort = COALESCE(excluded.effort, project_agents.effort),
        global_agent_id = COALESCE(excluded.global_agent_id, project_agents.global_agent_id),
        sort_order = excluded.sort_order,
        synced = excluded.synced
    `).run(
      agent.id,
      projectId,
      agent.globalAgentId ?? null,
      agent.name,
      agent.title ?? null,
      agent.mentionKey,
      agent.systemPrompt,
      agent.color,
      agent.avatar ?? null,
      agent.model ?? null,
      agent.effort ?? null,
      agent.sortOrder,
      0,
    )
  }

  getAgentsByProject(projectId: string): ProjectAgent[] {
    const rows = this.db.prepare('SELECT * FROM project_agents WHERE project_id = ? ORDER BY sort_order').all(projectId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToAgent(r))
  }

  deleteAgent(id: string, projectId?: string): void {
    if (projectId) {
      this.db.prepare('DELETE FROM project_agents WHERE id = ? AND project_id = ?').run(id, projectId)
    } else {
      this.db.prepare('DELETE FROM project_agents WHERE id = ?').run(id)
    }
  }

  linkProjectAgentToGlobal(projectAgentId: string, globalAgentId: string): void {
    this.db.prepare('UPDATE project_agents SET global_agent_id = ? WHERE id = ?').run(globalAgentId, projectAgentId)
  }

  updateProjectAgentsByGlobal(globalAgentId: string, updates: { name: string; title?: string; mentionKey: string; systemPrompt: string; color: string; avatar?: string; model?: string; effort?: string }): void {
    // Update by global_agent_id link OR by matching id (for pre-migration agents where id === global_agent_id)
    this.db.prepare(`
      UPDATE project_agents SET name = ?, title = ?, mention_key = ?, system_prompt = ?, color = ?, avatar = ?,
        model = COALESCE(?, model),
        effort = COALESCE(?, effort)
      WHERE global_agent_id = ? OR id = ?
    `).run(updates.name, updates.title ?? null, updates.mentionKey, updates.systemPrompt, updates.color, updates.avatar ?? null, updates.model ?? null, updates.effort ?? null, globalAgentId, globalAgentId)
  }

  markAgentSynced(id: string): void {
    this.db.prepare('UPDATE project_agents SET synced = 1 WHERE id = ?').run(id)
  }

  private rowToAgent(row: Record<string, unknown>): ProjectAgent {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      globalAgentId: row.global_agent_id as string | undefined,
      name: row.name as string,
      title: row.title as string | undefined,
      mentionKey: row.mention_key as string,
      systemPrompt: row.system_prompt as string,
      color: row.color as string,
      avatar: row.avatar as string | undefined,
      model: (row.model as string | null) ?? undefined,
      effort: (row.effort as string | null) ?? undefined,
      sortOrder: row.sort_order as number,
      status: 'idle',
      stopped: row.stopped === 1,
    }
  }

  /** Flip the per-agent kill switch (see ProjectAgent.stopped). */
  setAgentStopped(agentId: string, stopped: boolean): void {
    this.db.prepare('UPDATE project_agents SET stopped = ? WHERE id = ?').run(stopped ? 1 : 0, agentId)
  }

  isAgentStopped(agentId: string): boolean {
    const row = this.db.prepare('SELECT stopped FROM project_agents WHERE id = ?').get(agentId) as
      | { stopped: number | null }
      | undefined
    return row?.stopped === 1
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  saveMessage(message: ChatMessage): void {
    this.db.prepare(`
      INSERT INTO chat_messages
        (id, project_id, role, agent_local_id, agent_name, content, thinking_content, mentions, reply_to_local_id, session_id, status, metadata, attachments, client_timestamp, synced, sync_attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        thinking_content = excluded.thinking_content,
        mentions = excluded.mentions,
        status = excluded.status,
        metadata = excluded.metadata,
        attachments = excluded.attachments,
        synced = excluded.synced,
        sync_attempts = excluded.sync_attempts
    `).run(
      message.id,
      message.projectId,
      message.role,
      message.agentLocalId ?? null,
      message.agentName ?? null,
      message.content,
      message.thinkingContent ?? null,
      JSON.stringify(message.mentions ?? []),
      message.replyToLocalId ?? null,
      message.sessionId ?? null,
      message.status === 'sending' || message.status === 'streaming' ? 'done' : message.status,
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.attachments && message.attachments.length > 0 ? JSON.stringify(message.attachments) : null,
      message.clientTimestamp,
      message.synced ? 1 : 0,
      0,
    )
  }

  getMessageById(id: string): ChatMessage | null {
    const row = this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToMessage(row) : null
  }

  updateMessageContent(id: string, content: string, status: string, thinkingContent?: string): void {
    this.db.prepare('UPDATE chat_messages SET content = ?, thinking_content = ?, status = ? WHERE id = ?').run(content, thinkingContent ?? null, status, id)
  }

  updateMessageMetadata(id: string, metadata: Record<string, string>): void {
    this.db.prepare('UPDATE chat_messages SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), id)
  }

  getMessagesByProject(projectId: string, limit: number = 100, offset: number = 0): ChatMessage[] {
    // Subquery: get the last N messages (DESC), then re-sort ASC for display order
    const rows = this.db.prepare(
      `SELECT * FROM (
        SELECT * FROM chat_messages WHERE project_id = ? ORDER BY client_timestamp DESC LIMIT ? OFFSET ?
      ) sub ORDER BY client_timestamp ASC`
    ).all(projectId, limit, offset) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMessage(r))
  }

  getUnsyncedMessages(limit: number = 100): ChatMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM chat_messages WHERE synced = 0 AND sync_attempts < 5 ORDER BY client_timestamp ASC LIMIT ?'
    ).all(limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMessage(r))
  }

  markMessageSynced(id: string): void {
    this.db.prepare('UPDATE chat_messages SET synced = 1 WHERE id = ?').run(id)
  }

  markMessageSyncFailed(id: string, error: string): void {
    this.db.prepare('UPDATE chat_messages SET sync_attempts = sync_attempts + 1 WHERE id = ?').run(id)
  }

  getThreadMessages(parentMessageId: string): ChatMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM chat_messages WHERE reply_to_local_id = ? ORDER BY client_timestamp ASC'
    ).all(parentMessageId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMessage(r))
  }

  deleteMessage(id: string): void {
    this.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id)
  }

  deleteOldMessages(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString()
    const result = this.db.prepare('DELETE FROM chat_messages WHERE client_timestamp < ? AND synced = 1').run(cutoff)
    return result.changes
  }

  private rowToMessage(row: Record<string, unknown>): ChatMessage {
    let mentions: string[] = []
    try {
      mentions = JSON.parse(row.mentions as string || '[]')
    } catch { /* empty */ }

    let metadata: Record<string, string> | undefined
    if (row.metadata && typeof row.metadata === 'string') {
      try { metadata = JSON.parse(row.metadata) } catch { /* ignore */ }
    }

    let attachments: ChatMessage['attachments']
    if (row.attachments && typeof row.attachments === 'string') {
      try { attachments = JSON.parse(row.attachments) } catch { /* ignore */ }
    }

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      role: row.role as 'user' | 'agent',
      agentLocalId: row.agent_local_id as string | undefined,
      agentName: row.agent_name as string | undefined,
      content: row.content as string,
      thinkingContent: (row.thinking_content as string) || undefined,
      mentions,
      replyToLocalId: row.reply_to_local_id as string | undefined,
      sessionId: row.session_id as string | undefined,
      status: row.status as ChatMessage['status'],
      metadata,
      attachments,
      clientTimestamp: row.client_timestamp as string,
      synced: row.synced === 1,
    }
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  getNextTicketNumber(projectId: string): number {
    const row = this.db.prepare(
      'SELECT COALESCE(MAX(ticket_number), 0) as max_num FROM tickets WHERE project_id = ?'
    ).get(projectId) as { max_num: number }
    return row.max_num + 1
  }

  getTicketByNumber(projectId: string, ticketNumber: number): Ticket | null {
    const row = this.db.prepare(
      'SELECT * FROM tickets WHERE project_id = ? AND ticket_number = ?'
    ).get(projectId, ticketNumber) as Record<string, unknown> | undefined
    if (!row) return null
    const ticket = this.rowToTicket(row)
    ticket.comments = this.getCommentsByTicket(ticket.id)
    return ticket
  }

  saveTicket(ticket: Ticket): void {
    this.db.prepare(`
      INSERT INTO tickets (id, project_id, ticket_number, title, description, status, category, assigned_agent_local_id, assigned_agent_name, goal_id, external_id, epic_id, sort_order, attachments, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        category = excluded.category,
        assigned_agent_local_id = excluded.assigned_agent_local_id,
        assigned_agent_name = excluded.assigned_agent_name,
        goal_id = excluded.goal_id,
        external_id = excluded.external_id,
        epic_id = excluded.epic_id,
        sort_order = excluded.sort_order,
        attachments = excluded.attachments,
        updated_at = excluded.updated_at,
        synced = excluded.synced
    `).run(
      ticket.id,
      ticket.projectId,
      ticket.ticketNumber,
      ticket.title,
      ticket.description ?? null,
      ticket.status,
      ticket.category ?? null,
      ticket.assignedAgentLocalId ?? null,
      ticket.assignedAgentName ?? null,
      ticket.goalId ?? null,
      ticket.externalId ?? null,
      ticket.epicId ?? null,
      ticket.sortOrder,
      ticket.attachments && ticket.attachments.length > 0 ? JSON.stringify(ticket.attachments) : null,
      ticket.createdAt,
      ticket.updatedAt,
      ticket.synced ? 1 : 0,
    )
  }

  getTicket(id: string): Ticket | null {
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const ticket = this.rowToTicket(row)
    ticket.comments = this.getCommentsByTicket(id)
    return ticket
  }

  getTicketsByProject(projectId: string): Ticket[] {
    const rows = this.db.prepare(
      'SELECT * FROM tickets WHERE project_id = ? ORDER BY sort_order, created_at DESC'
    ).all(projectId) as Record<string, unknown>[]
    return rows.map((r) => {
      const ticket = this.rowToTicket(r)
      ticket.comments = this.getCommentsByTicket(ticket.id)
      return ticket
    })
  }

  getTicketsGrouped(projectId: string): { open: Ticket[]; in_progress: Ticket[]; done: Ticket[] } {
    const tickets = this.getTicketsByProject(projectId)
    const done = tickets.filter((t) => t.status === 'done')
    done.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return {
      open: tickets.filter((t) => t.status === 'open'),
      in_progress: tickets.filter((t) => t.status === 'in_progress'),
      done,
    }
  }

  updateTicket(id: string, updates: Partial<Ticket>, projectId?: string): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status) }
    if (updates.assignedAgentLocalId !== undefined) { fields.push('assigned_agent_local_id = ?'); values.push(updates.assignedAgentLocalId) }
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category) }
    if (updates.assignedAgentName !== undefined) { fields.push('assigned_agent_name = ?'); values.push(updates.assignedAgentName) }
    if (updates.externalId !== undefined) { fields.push('external_id = ?'); values.push(updates.externalId) }
    if (updates.epicId !== undefined) { fields.push('epic_id = ?'); values.push(updates.epicId) }
    if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder) }
    if (updates.attachments !== undefined) {
      fields.push('attachments = ?')
      values.push(updates.attachments.length > 0 ? JSON.stringify(updates.attachments) : null)
    }

    if (fields.length === 0) return

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    fields.push('synced = 0')
    values.push(id)

    if (projectId) {
      values.push(projectId)
      this.db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`).run(...values)
    } else {
      this.db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
  }

  deleteTicket(id: string, projectId?: string): void {
    if (projectId) {
      this.db.prepare('DELETE FROM tickets WHERE id = ? AND project_id = ?').run(id, projectId)
    } else {
      this.db.prepare('DELETE FROM tickets WHERE id = ?').run(id)
    }
  }

  markTicketSynced(id: string): void {
    this.db.prepare('UPDATE tickets SET synced = 1 WHERE id = ?').run(id)
  }

  // ── Ticket Import ──────────────────────────────────────────────────────────

  getTicketIdsByExternalId(projectId: string): Map<string, string> {
    const rows = this.db.prepare(
      'SELECT id, external_id FROM tickets WHERE project_id = ? AND external_id IS NOT NULL'
    ).all(projectId) as { id: string; external_id: string }[]
    return new Map(rows.map((r) => [r.external_id, r.id]))
  }

  replaceTicketDependencies(ticketId: string, dependsOnIds: string[]): void {
    this.db.prepare('DELETE FROM ticket_dependencies WHERE ticket_id = ?').run(ticketId)
    const insert = this.db.prepare('INSERT OR IGNORE INTO ticket_dependencies (ticket_id, depends_on_id) VALUES (?, ?)')
    for (const depId of dependsOnIds) {
      insert.run(ticketId, depId)
    }
  }

  /** Add a single dependency (ticketId depends on dependsOnId) without touching existing ones. */
  addTicketDependency(ticketId: string, dependsOnId: string): void {
    if (ticketId === dependsOnId) return
    this.db.prepare('INSERT OR IGNORE INTO ticket_dependencies (ticket_id, depends_on_id) VALUES (?, ?)')
      .run(ticketId, dependsOnId)
  }

  getTicketDependencies(ticketId: string): string[] {
    const rows = this.db.prepare(
      'SELECT depends_on_id FROM ticket_dependencies WHERE ticket_id = ?'
    ).all(ticketId) as { depends_on_id: string }[]
    return rows.map((r) => r.depends_on_id)
  }

  /** Wendet einen Import-Plan in EINER Transaction an — inkl. sync_queue-Einträgen. */
  applyTicketImport(plan: ImportPlan): void {
    const apply = this.db.transaction(() => {
      for (const ticket of plan.inserts) {
        this.saveTicket(ticket)
        this.addToSyncQueue('ticket', ticket.id, 'create', ticket)
      }
      for (const { id, updates } of plan.updates) {
        this.updateTicket(id, updates)
        this.addToSyncQueue('ticket', id, 'update', { id, ...updates })
      }
      for (const { ticketId, dependsOnIds } of plan.dependencies) {
        this.replaceTicketDependencies(ticketId, dependsOnIds)
      }
    })
    apply()
  }

  private rowToTicket(row: Record<string, unknown>): Ticket {
    let attachments: Ticket['attachments']
    if (row.attachments && typeof row.attachments === 'string') {
      try { attachments = JSON.parse(row.attachments) } catch { /* ignore */ }
    }
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      ticketNumber: (row.ticket_number as number) ?? 0,
      title: row.title as string,
      description: row.description as string | undefined,
      status: row.status as Ticket['status'],
      category: row.category as Ticket['category'],
      assignedAgentLocalId: row.assigned_agent_local_id as string | undefined,
      assignedAgentName: row.assigned_agent_name as string | undefined,
      goalId: row.goal_id as number | undefined,
      externalId: (row.external_id as string) || undefined,
      epicId: (row.epic_id as string) || undefined,
      dependsOnIds: this.getTicketDependencies(row.id as string),
      sortOrder: row.sort_order as number,
      comments: [],
      attachments,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      synced: row.synced === 1,
    }
  }

  // ── Ticket Comments ──────────────────────────────────────────────────────

  saveComment(comment: TicketComment): void {
    this.db.prepare(`
      INSERT INTO ticket_comments (id, ticket_id, project_id, author_type, agent_local_id, agent_name, content, client_timestamp, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        synced = excluded.synced
    `).run(
      comment.id,
      comment.ticketId,
      comment.projectId,
      comment.authorType,
      comment.agentLocalId ?? null,
      comment.agentName ?? null,
      comment.content,
      comment.clientTimestamp,
      comment.synced ? 1 : 0,
    )
  }

  getCommentsByTicket(ticketId: string): TicketComment[] {
    const rows = this.db.prepare(
      'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY client_timestamp ASC'
    ).all(ticketId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToComment(r))
  }

  markCommentSynced(id: string): void {
    this.db.prepare('UPDATE ticket_comments SET synced = 1 WHERE id = ?').run(id)
  }

  private rowToComment(row: Record<string, unknown>): TicketComment {
    return {
      id: row.id as string,
      ticketId: row.ticket_id as string,
      projectId: row.project_id as string,
      authorType: row.author_type as TicketComment['authorType'],
      agentLocalId: row.agent_local_id as string | undefined,
      agentName: row.agent_name as string | undefined,
      content: row.content as string,
      clientTimestamp: row.client_timestamp as string,
      synced: row.synced === 1,
    }
  }

  // ── Ticket Summary for Agents ────────────────────────────────────────────

  getTicketsSummaryForAgent(projectId: string): string {
    const tickets = this.getTicketsByProject(projectId)
    if (tickets.length === 0) return ''

    const statusLabel: Record<string, string> = {
      open: 'OPEN',
      in_progress: 'IN PROGRESS',
      done: 'DONE',
    }

    const lines = tickets.map((t) => {
      const assigned = t.assignedAgentName ? `→ ${t.assignedAgentName}` : 'unzugewiesen'
      const cat = t.category ? ` [${t.category.toUpperCase()}]` : ''
      let line = `[${statusLabel[t.status]}]${cat} #${t.ticketNumber} ${t.title} (${assigned})`
      if (t.description) {
        line += `\n  Beschreibung: ${t.description}`
      }
      if (t.comments.length > 0) {
        const lastComment = t.comments[t.comments.length - 1]
        const author = lastComment.authorType === 'agent' ? (lastComment.agentName ?? 'Agent') : 'User'
        line += `\n  Letzter Kommentar (${author}): ${lastComment.content.substring(0, 150)}`
      }
      return line
    })

    return lines.join('\n\n')
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  saveDocument(doc: ProjectDocument): void {
    this.db.prepare(`
      INSERT INTO project_documents (id, project_id, title, content, created_by_agent_id, created_by_agent_name, updated_by_agent_id, updated_by_agent_name, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        updated_by_agent_id = excluded.updated_by_agent_id,
        updated_by_agent_name = excluded.updated_by_agent_name,
        updated_at = excluded.updated_at,
        synced = excluded.synced
    `).run(
      doc.id,
      doc.projectId,
      doc.title,
      doc.content,
      doc.createdByAgentId ?? null,
      doc.createdByAgentName ?? null,
      doc.updatedByAgentId ?? null,
      doc.updatedByAgentName ?? null,
      doc.createdAt,
      doc.updatedAt,
      doc.synced ? 1 : 0,
    )
  }

  getDocument(id: string): ProjectDocument | null {
    const row = this.db.prepare('SELECT * FROM project_documents WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToDocument(row) : null
  }

  getDocumentByTitle(projectId: string, title: string): ProjectDocument | null {
    const row = this.db.prepare('SELECT * FROM project_documents WHERE project_id = ? AND title = ? COLLATE NOCASE').get(projectId, title) as Record<string, unknown> | undefined
    return row ? this.rowToDocument(row) : null
  }

  getDocumentsByProject(projectId: string): ProjectDocument[] {
    const rows = this.db.prepare(
      'SELECT * FROM project_documents WHERE project_id = ? ORDER BY updated_at DESC'
    ).all(projectId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToDocument(r))
  }

  updateDocument(id: string, updates: Partial<ProjectDocument>, projectId?: string): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
    if (updates.updatedByAgentId !== undefined) { fields.push('updated_by_agent_id = ?'); values.push(updates.updatedByAgentId) }
    if (updates.updatedByAgentName !== undefined) { fields.push('updated_by_agent_name = ?'); values.push(updates.updatedByAgentName) }

    if (fields.length === 0) return

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    fields.push('synced = 0')
    values.push(id)

    if (projectId) {
      values.push(projectId)
      this.db.prepare(`UPDATE project_documents SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`).run(...values)
    } else {
      this.db.prepare(`UPDATE project_documents SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
  }

  deleteDocument(id: string, projectId?: string): void {
    if (projectId) {
      this.db.prepare('DELETE FROM project_documents WHERE id = ? AND project_id = ?').run(id, projectId)
    } else {
      this.db.prepare('DELETE FROM project_documents WHERE id = ?').run(id)
    }
  }

  markDocumentSynced(id: string): void {
    this.db.prepare('UPDATE project_documents SET synced = 1 WHERE id = ?').run(id)
  }

  getDocumentsSummaryForAgent(projectId: string): string {
    const docs = this.getDocumentsByProject(projectId)
    if (docs.length === 0) return ''

    return docs.map((d) => {
      const author = d.updatedByAgentName || d.createdByAgentName || 'User'
      const preview = d.content.length > 150 ? d.content.substring(0, 150) + '...' : d.content
      return `📄 "${d.title}" (zuletzt: ${author})\n  ${preview}`
    }).join('\n\n')
  }

  private rowToDocument(row: Record<string, unknown>): ProjectDocument {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      title: row.title as string,
      content: row.content as string,
      createdByAgentId: row.created_by_agent_id as string | undefined,
      createdByAgentName: row.created_by_agent_name as string | undefined,
      updatedByAgentId: row.updated_by_agent_id as string | undefined,
      updatedByAgentName: row.updated_by_agent_name as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      synced: row.synced === 1,
    }
  }

  // ── Agent Memories ─────────────────────────────────────────────────────────

  getMemoriesForAgent(globalAgentId: string, projectId?: string): AgentMemory[] {
    const rows = this.db.prepare(`
      SELECT * FROM agent_memories
      WHERE global_agent_id = ? AND (project_id IS NULL OR project_id = ?)
      ORDER BY importance DESC, last_accessed_at DESC
      LIMIT 20
    `).all(globalAgentId, projectId ?? null) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMemory(r))
  }

  getAllMemoriesForAgent(globalAgentId: string): AgentMemory[] {
    const rows = this.db.prepare(`
      SELECT * FROM agent_memories WHERE global_agent_id = ?
      ORDER BY importance DESC, last_accessed_at DESC
    `).all(globalAgentId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMemory(r))
  }

  saveMemory(globalAgentId: string, projectId: string | null, key: string, value: string, importance: number, source: 'agent' | 'user'): void {
    const now = new Date().toISOString()
    // Upsert by globalAgentId + key + projectId
    const existing = this.db.prepare(`
      SELECT id FROM agent_memories
      WHERE global_agent_id = ? AND key = ? AND (project_id IS ? OR (project_id IS NOT NULL AND project_id = ?))
    `).get(globalAgentId, key, projectId, projectId) as { id: number } | undefined

    if (existing) {
      this.db.prepare(`
        UPDATE agent_memories SET value = ?, importance = ?, source = ?, updated_at = ?
        WHERE id = ?
      `).run(value.substring(0, 500), importance, source, now, existing.id)
    } else {
      this.db.prepare(`
        INSERT INTO agent_memories (global_agent_id, project_id, key, value, importance, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(globalAgentId, projectId, key, value.substring(0, 500), importance, source, now, now)
    }
  }

  deleteMemory(id: number): void {
    this.db.prepare('DELETE FROM agent_memories WHERE id = ?').run(id)
  }

  deleteMemoryByKey(globalAgentId: string, key: string): void {
    this.db.prepare('DELETE FROM agent_memories WHERE global_agent_id = ? AND key = ?').run(globalAgentId, key)
  }

  clearAllMemories(globalAgentId: string): void {
    this.db.prepare('DELETE FROM agent_memories WHERE global_agent_id = ?').run(globalAgentId)
  }

  touchMemories(ids: number[]): void {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`
      UPDATE agent_memories SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id IN (${placeholders})
    `).run(now, ...ids)
  }

  private rowToMemory(row: Record<string, unknown>): AgentMemory {
    return {
      id: row.id as number,
      globalAgentId: row.global_agent_id as string,
      projectId: row.project_id as string | null,
      key: row.key as string,
      value: row.value as string,
      importance: row.importance as 1 | 2 | 3,
      source: row.source as 'agent' | 'user',
      accessCount: row.access_count as number,
      lastAccessedAt: row.last_accessed_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  // ── Project Goals ──────────────────────────────────────────────────────────

  saveGoal(projectId: string, title: string, description: string, selectedAgentIds?: string[], mode: GoalMode = 'ai'): ProjectGoal {
    const now = new Date().toISOString()
    const agentIdsJson = selectedAgentIds ? JSON.stringify(selectedAgentIds) : null
    const result = this.db.prepare(`
      INSERT INTO project_goals (project_id, title, description, status, mode, retry_count, selected_agent_ids, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?)
    `).run(projectId, title, description, mode, agentIdsJson, now, now)

    return {
      id: result.lastInsertRowid as number,
      projectId,
      title,
      description,
      status: 'pending',
      mode,
      selectedAgentIds,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  getGoal(id: number): ProjectGoal | null {
    const row = this.db.prepare('SELECT * FROM project_goals WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToGoal(row) : null
  }

  getGoalsByProject(projectId: string): ProjectGoal[] {
    const rows = this.db.prepare('SELECT * FROM project_goals WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToGoal(r))
  }

  updateGoalStatus(id: number, status: GoalStatus, phase?: GoalPhase): void {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE project_goals SET status = ?, current_phase = ?, updated_at = ? WHERE id = ?')
      .run(status, phase ?? null, now, id)
  }

  updateGoalPflichtenheft(id: number, documentId: string): void {
    this.db.prepare('UPDATE project_goals SET pflichtenheft_document_id = ? WHERE id = ?').run(documentId, id)
  }

  incrementGoalRetry(id: number): number {
    this.db.prepare('UPDATE project_goals SET retry_count = retry_count + 1 WHERE id = ?').run(id)
    const row = this.db.prepare('SELECT retry_count FROM project_goals WHERE id = ?').get(id) as { retry_count: number }
    return row.retry_count
  }

  getTicketsByGoal(goalId: number): Ticket[] {
    const rows = this.db.prepare('SELECT * FROM tickets WHERE goal_id = ? ORDER BY ticket_number ASC').all(goalId) as Record<string, unknown>[]
    return rows.map((r) => {
      const ticket = this.rowToTicket(r)
      ticket.comments = this.getCommentsByTicket(ticket.id)
      return ticket
    })
  }

  setTicketGoalId(ticketId: string, goalId: number): void {
    this.db.prepare('UPDATE tickets SET goal_id = ? WHERE id = ?').run(goalId, ticketId)
  }

  addGoalRunLog(goalId: number, step: GoalPhase, message: string, agentName?: string, ticketId?: string, status: 'running' | 'success' | 'failed' = 'running'): GoalRunLog {
    const result = this.db.prepare(`
      INSERT INTO goal_run_log (goal_id, step, agent_name, ticket_id, message, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(goalId, step, agentName ?? null, ticketId ?? null, message, status)

    return {
      id: result.lastInsertRowid as number,
      goalId,
      step: step as GoalPhase,
      agentName,
      ticketId,
      message,
      status,
      createdAt: new Date().toISOString(),
    }
  }

  updateGoalRunLog(id: number, status: 'success' | 'failed', message?: string): void {
    if (message) {
      this.db.prepare('UPDATE goal_run_log SET status = ?, message = ? WHERE id = ?').run(status, message, id)
    } else {
      this.db.prepare('UPDATE goal_run_log SET status = ? WHERE id = ?').run(status, id)
    }
  }

  getGoalRunLog(goalId: number): GoalRunLog[] {
    const rows = this.db.prepare('SELECT * FROM goal_run_log WHERE goal_id = ? ORDER BY created_at ASC').all(goalId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number,
      goalId: r.goal_id as number,
      step: r.step as GoalPhase,
      agentName: r.agent_name as string | undefined,
      ticketId: r.ticket_id as string | undefined,
      message: r.message as string,
      status: r.status as 'running' | 'success' | 'failed',
      errorType: r.error_type as GoalErrorType | undefined,
      createdAt: r.created_at as string,
    }))
  }

  getActiveGoals(): ProjectGoal[] {
    const rows = this.db.prepare(
      `SELECT * FROM project_goals WHERE status NOT IN ('done', 'cancelled', 'failed') ORDER BY created_at ASC`
    ).all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToGoal(r))
  }

  updateGoalWithError(id: number, status: GoalStatus, errorType: GoalErrorType, errorMessage: string): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE project_goals SET status = ?, error_type = ?, error_message = ?, updated_at = ?, completed_at = ? WHERE id = ?'
    ).run(status, errorType, errorMessage, now, now, id)
  }

  updateGoalCheckpoint(id: number, checkpoint: GoalCheckpoint | null): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE project_goals SET checkpoint_data = ?, updated_at = ? WHERE id = ?'
    ).run(checkpoint ? JSON.stringify(checkpoint) : null, now, id)
  }

  clearGoalError(id: number): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE project_goals SET error_type = NULL, error_message = NULL, updated_at = ? WHERE id = ?'
    ).run(now, id)
  }

  setGoalCompleted(id: number): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE project_goals SET completed_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, id)
  }

  private rowToGoal(row: Record<string, unknown>): ProjectGoal {
    let selectedAgentIds: string[] | undefined
    if (row.selected_agent_ids) {
      try { selectedAgentIds = JSON.parse(row.selected_agent_ids as string) } catch { /* ignore */ }
    }
    let checkpointData: GoalCheckpoint | undefined
    if (row.checkpoint_data) {
      try { checkpointData = JSON.parse(row.checkpoint_data as string) } catch { /* ignore */ }
    }
    return {
      id: row.id as number,
      projectId: row.project_id as string,
      title: row.title as string,
      description: row.description as string,
      status: row.status as GoalStatus,
      mode: ((row.mode as string) || 'ai') as GoalMode,
      pflichtenheftDocumentId: row.pflichtenheft_document_id as string | undefined,
      currentPhase: row.current_phase as GoalPhase | undefined,
      selectedAgentIds,
      retryCount: row.retry_count as number,
      errorType: row.error_type as GoalErrorType | undefined,
      errorMessage: row.error_message as string | undefined,
      checkpointData,
      completedAt: row.completed_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  // ── Ratings (Bewertungssystem) ──────────────────────────────────────────────

  private migrateToV14(): void {
    log('info', 'Running migration to schema v14 (ratings, rating_category_scores)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ratings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        period TEXT NOT NULL,
        stay_type TEXT NOT NULL,
        categories TEXT NOT NULL,
        facilities_inside TEXT NOT NULL DEFAULT '[]',
        facilities_nearby TEXT NOT NULL DEFAULT '[]',
        impression TEXT NOT NULL,
        title TEXT NOT NULL,
        sleep_type TEXT,
        rank TEXT,
        age_group TEXT,
        family_status TEXT,
        first_name TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        verification_code TEXT,
        verified_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rating_category_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rating_id TEXT NOT NULL,
        category TEXT NOT NULL,
        score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
        FOREIGN KEY (rating_id) REFERENCES ratings(id) ON DELETE CASCADE
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_ratings_project ON ratings(project_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_ratings_status ON ratings(status)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_ratings_email ON ratings(email)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_rating_scores_rating ON rating_category_scores(rating_id)')

    log('info', 'Migration to schema v14 completed')
  }

  // ── Email Verifications ────────────────────────────────────────────────────

  private migrateToV15(): void {
    log('info', 'Running migration to schema v15 (email_verifications)...')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email)')

    log('info', 'Migration to schema v15 completed')
  }

  private migrateToV16(): void {
    log('info', 'Running migration to schema v16 (message attachments)...')
    this.db.exec(`ALTER TABLE chat_messages ADD COLUMN attachments TEXT`)
    log('info', 'Migration to schema v16 completed')
  }

  private migrateToV18(): void {
    log('info', 'Running migration to schema v18 (ticket attachments)...')
    this.db.exec(`ALTER TABLE tickets ADD COLUMN attachments TEXT`)
    log('info', 'Migration to schema v18 completed')
  }

  private migrateToV19(): void {
    log('info', 'Running migration to schema v19 (ticket external_id, epic_id, ticket_dependencies)...')

    try { this.db.exec('ALTER TABLE tickets ADD COLUMN external_id TEXT') } catch { /* exists */ }
    try { this.db.exec('ALTER TABLE tickets ADD COLUMN epic_id TEXT') } catch { /* exists */ }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ticket_dependencies (
        ticket_id TEXT NOT NULL,
        depends_on_id TEXT NOT NULL,
        PRIMARY KEY (ticket_id, depends_on_id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_external ON tickets(project_id, external_id)')

    log('info', 'Migration to schema v19 completed')
  }

  private migrateToV20(): void {
    log('info', 'Running migration to schema v20 (goal mode)...')
    // 'ai' = classic pipeline, 'selected' = user-picked tickets. Existing goals stay 'ai'.
    try { this.db.exec("ALTER TABLE project_goals ADD COLUMN mode TEXT DEFAULT 'ai'") } catch { /* exists */ }
    log('info', 'Migration to schema v20 completed')
  }

  private migrateToV21(): void {
    log('info', 'Running migration to schema v21 (per-agent model)...')
    // Per-agent LLM model (a concrete model id passed to `claude --model <id>`). Backfill
    // EXISTING agents to 'claude-opus-4-8' so current users keep the Opus behavior they had
    // (everything ran on Opus before this) while mapping onto a concrete picker option. New
    // agents created via IPC default to DEFAULT_AGENT_MODEL ('claude-sonnet-5') to cut cost.
    try { this.db.exec("ALTER TABLE global_agents ADD COLUMN model TEXT") } catch { /* exists */ }
    try { this.db.exec("ALTER TABLE project_agents ADD COLUMN model TEXT") } catch { /* exists */ }
    try { this.db.exec("UPDATE global_agents SET model = 'claude-opus-4-8' WHERE model IS NULL") } catch { /* ignore */ }
    try { this.db.exec("UPDATE project_agents SET model = 'claude-opus-4-8' WHERE model IS NULL") } catch { /* ignore */ }
    log('info', 'Migration to schema v21 completed')
  }

  private migrateToV22(): void {
    log('info', 'Running migration to schema v22 (per-agent stop switch)...')
    // Per-agent kill switch. Persisted so a stopped agent stays stopped across app restarts
    // (otherwise resumeInterruptedGoals would hand it work again right after a restart).
    try { this.db.exec('ALTER TABLE project_agents ADD COLUMN stopped INTEGER DEFAULT 0') } catch { /* exists */ }
    log('info', 'Migration to schema v22 completed')
  }

  private migrateToV23(): void {
    log('info', 'Running migration to schema v23 (repair models wiped by backend sync)...')
    // The startup full sync used to rebuild project_agents from a backend payload that carries
    // neither `model` nor `global_agent_id`, overwriting both with NULL — so every agent silently
    // fell back to DEFAULT_AGENT_MODEL. The sync is fixed and saveAgent now COALESCEs, but rows
    // already wiped need repairing from global_agents, which still holds the real models.

    // 1. Restore the model from the most recently updated global agent of the same name.
    const repaired = this.db.prepare(`
      UPDATE project_agents
      SET model = (
        SELECT ga.model FROM global_agents ga
        WHERE ga.name = project_agents.name AND ga.model IS NOT NULL
        ORDER BY ga.updated_at DESC LIMIT 1
      )
      WHERE model IS NULL
        AND EXISTS (SELECT 1 FROM global_agents ga WHERE ga.name = project_agents.name AND ga.model IS NOT NULL)
    `).run().changes

    // 2. Restore the global-agent link, but ONLY where the name maps to exactly one global agent.
    //    A wrong link would silently propagate the wrong prompt/model edits and the wrong memories,
    //    so ambiguous names are deliberately left unlinked.
    const relinked = this.db.prepare(`
      UPDATE project_agents
      SET global_agent_id = (SELECT ga.id FROM global_agents ga WHERE ga.name = project_agents.name)
      WHERE global_agent_id IS NULL
        AND (SELECT COUNT(*) FROM global_agents ga WHERE ga.name = project_agents.name) = 1
    `).run().changes

    // 3. Anything with no global counterpart at all: fall back to the v21 default rather than
    //    leaving a NULL that would read as Sonnet on every start.
    const defaulted = this.db.prepare(
      "UPDATE project_agents SET model = 'claude-opus-4-8' WHERE model IS NULL"
    ).run().changes

    log('info', `Migration to schema v23 completed (${repaired} model(s) restored, ${relinked} re-linked, ${defaulted} defaulted)`)
  }

  private migrateToV24(): void {
    log('info', 'Running migration to schema v24 (session turn counter)...')
    // Ticket work now shares ONE Claude session per (project, agent, goal) instead of starting a
    // cold one per ticket, so the agent keeps the repo in context. turn_count bounds how long a
    // session is reused before a deliberate fresh start, so the transcript cannot grow forever.
    // Purely additive — no session rows are removed. Rows written under the old per-ticket scope
    // keys simply stop being looked up; they stay in place and cost nothing.
    try { this.db.exec('ALTER TABLE claude_sessions ADD COLUMN turn_count INTEGER DEFAULT 0') } catch { /* exists */ }
    log('info', 'Migration to schema v24 completed')
  }

  private migrateToV25(): void {
    log('info', 'Running migration to schema v25 (per-agent effort)...')
    // Per-agent thinking depth, passed as `claude --effort <level>`. Backfill EXISTING agents to
    // 'xhigh' — that is the Claude Code CLI default they have been running at all along, so this
    // migration changes no behavior. New agents created via IPC default to DEFAULT_AGENT_EFFORT
    // ('high') to cut token cost, the same trade-off as DEFAULT_AGENT_MODEL.
    try { this.db.exec('ALTER TABLE global_agents ADD COLUMN effort TEXT') } catch { /* exists */ }
    try { this.db.exec('ALTER TABLE project_agents ADD COLUMN effort TEXT') } catch { /* exists */ }
    try { this.db.exec("UPDATE global_agents SET effort = 'xhigh' WHERE effort IS NULL") } catch { /* ignore */ }
    try { this.db.exec("UPDATE project_agents SET effort = 'xhigh' WHERE effort IS NULL") } catch { /* ignore */ }
    log('info', 'Migration to schema v25 completed')
  }

  private migrateToV17(): void {
    log('info', 'Running migration to schema v17 (claude sessions)...')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claude_sessions (
        scope_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        cwd TEXT,
        last_used_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    log('info', 'Migration to schema v17 completed')
  }

  // ── Claude CLI Session Persistence ────────────────────────────────────────
  // Stores the Claude Code session_id per (project, agent[, goal]) scope so
  // follow-up prompts can pass --resume <id> and reuse warm context + prompt cache.

  getClaudeSession(scopeKey: string): { sessionId: string; cwd: string | null; turnCount: number } | null {
    const row = this.db.prepare(
      'SELECT session_id, cwd, turn_count FROM claude_sessions WHERE scope_key = ?'
    ).get(scopeKey) as { session_id: string; cwd: string | null; turn_count: number | null } | undefined
    if (!row) return null
    return { sessionId: row.session_id, cwd: row.cwd, turnCount: row.turn_count ?? 0 }
  }

  /**
   * Remember the Claude session for this scope. `turnCount` is the number of turns the session
   * has served — pass 1 for a fresh session, previous + 1 when a resume succeeded.
   */
  saveClaudeSession(scopeKey: string, sessionId: string, cwd: string | null, turnCount: number = 1): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO claude_sessions (scope_key, session_id, cwd, last_used_at, created_at, turn_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        session_id = excluded.session_id,
        cwd = excluded.cwd,
        last_used_at = excluded.last_used_at,
        turn_count = excluded.turn_count
    `).run(scopeKey, sessionId, cwd, now, now, turnCount)
  }

  deleteClaudeSession(scopeKey: string): void {
    this.db.prepare('DELETE FROM claude_sessions WHERE scope_key = ?').run(scopeKey)
  }

  saveEmailVerification(verification: { id: string; email: string; code: string; maxAttempts: number; expiresAt: string; createdAt: string }): void {
    this.db.prepare(`
      INSERT INTO email_verifications (id, email, code, attempts, max_attempts, expires_at, created_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        attempts = 0,
        expires_at = excluded.expires_at
    `).run(verification.id, verification.email, verification.code, verification.maxAttempts, verification.expiresAt, verification.createdAt)
  }

  getEmailVerification(id: string): { id: string; email: string; code: string; attempts: number; maxAttempts: number; expiresAt: string; verifiedAt: string | null; createdAt: string } | null {
    const row = this.db.prepare('SELECT * FROM email_verifications WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row.id as string,
      email: row.email as string,
      code: row.code as string,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      expiresAt: row.expires_at as string,
      verifiedAt: row.verified_at as string | null,
      createdAt: row.created_at as string,
    }
  }

  getVerifiedEmail(email: string): boolean {
    const row = this.db.prepare(
      'SELECT id FROM email_verifications WHERE email = ? AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 1'
    ).get(email) as Record<string, unknown> | undefined
    return !!row
  }

  incrementEmailVerificationAttempts(id: string): void {
    this.db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').run(id)
  }

  markEmailVerified(id: string): void {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE email_verifications SET verified_at = ? WHERE id = ?').run(now, id)
  }

  updateEmailVerificationCode(id: string, newCode: string, newExpiresAt: string): void {
    this.db.prepare('UPDATE email_verifications SET code = ?, attempts = 0, expires_at = ? WHERE id = ?').run(newCode, newExpiresAt, id)
  }

  cleanupExpiredEmailVerifications(): void {
    const now = new Date().toISOString()
    this.db.prepare('DELETE FROM email_verifications WHERE expires_at < ? AND verified_at IS NULL').run(now)
  }

  saveRating(rating: Rating): void {
    this.db.prepare(`
      INSERT INTO ratings (id, project_id, period, stay_type, categories, facilities_inside, facilities_nearby,
        impression, title, sleep_type, rank, age_group, family_status, first_name, email,
        status, verification_code, verified_at, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        period = excluded.period,
        stay_type = excluded.stay_type,
        categories = excluded.categories,
        facilities_inside = excluded.facilities_inside,
        facilities_nearby = excluded.facilities_nearby,
        impression = excluded.impression,
        title = excluded.title,
        sleep_type = excluded.sleep_type,
        rank = excluded.rank,
        age_group = excluded.age_group,
        family_status = excluded.family_status,
        first_name = excluded.first_name,
        email = excluded.email,
        status = excluded.status,
        verification_code = excluded.verification_code,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at,
        synced = excluded.synced
    `).run(
      rating.id,
      rating.projectId,
      rating.period,
      rating.stayType,
      JSON.stringify(rating.categories),
      JSON.stringify(rating.facilitiesInside),
      JSON.stringify(rating.facilitiesNearby),
      rating.impression,
      rating.title,
      rating.sleepType,
      rating.rank,
      rating.ageGroup,
      rating.familyStatus,
      rating.firstName,
      rating.email,
      rating.status,
      rating.verificationCode,
      rating.verifiedAt,
      rating.createdAt,
      rating.updatedAt,
      rating.synced ? 1 : 0,
    )
  }

  getRating(id: string): Rating | null {
    const row = this.db.prepare('SELECT * FROM ratings WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToRating(row) : null
  }

  getRatingsByProject(projectId: string): Rating[] {
    const rows = this.db.prepare(
      'SELECT * FROM ratings WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToRating(r))
  }

  getRatingsByStatus(projectId: string, status: string): Rating[] {
    const rows = this.db.prepare(
      'SELECT * FROM ratings WHERE project_id = ? AND status = ? ORDER BY created_at DESC'
    ).all(projectId, status) as Record<string, unknown>[]
    return rows.map((r) => this.rowToRating(r))
  }

  updateRatingStatus(id: string, status: string, verifiedAt?: string): void {
    const now = new Date().toISOString()
    if (verifiedAt) {
      this.db.prepare('UPDATE ratings SET status = ?, verified_at = ?, updated_at = ?, synced = 0 WHERE id = ?')
        .run(status, verifiedAt, now, id)
    } else {
      this.db.prepare('UPDATE ratings SET status = ?, updated_at = ?, synced = 0 WHERE id = ?')
        .run(status, now, id)
    }
  }

  deleteRating(id: string, projectId?: string): void {
    if (projectId) {
      this.db.prepare('DELETE FROM ratings WHERE id = ? AND project_id = ?').run(id, projectId)
    } else {
      this.db.prepare('DELETE FROM ratings WHERE id = ?').run(id)
    }
  }

  markRatingSynced(id: string): void {
    this.db.prepare('UPDATE ratings SET synced = 1 WHERE id = ?').run(id)
  }

  saveCategoryScore(ratingId: string, category: string, score: number): void {
    this.db.prepare(`
      INSERT INTO rating_category_scores (rating_id, category, score)
      VALUES (?, ?, ?)
    `).run(ratingId, category, score)
  }

  saveCategoryScores(ratingId: string, scores: { category: string; score: number }[]): void {
    this.db.prepare('DELETE FROM rating_category_scores WHERE rating_id = ?').run(ratingId)
    const stmt = this.db.prepare('INSERT INTO rating_category_scores (rating_id, category, score) VALUES (?, ?, ?)')
    const insertMany = this.db.transaction((items: { category: string; score: number }[]) => {
      for (const item of items) {
        stmt.run(ratingId, item.category, item.score)
      }
    })
    insertMany(scores)
  }

  getCategoryScores(ratingId: string): RatingCategoryScore[] {
    const rows = this.db.prepare(
      'SELECT * FROM rating_category_scores WHERE rating_id = ? ORDER BY category'
    ).all(ratingId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number,
      ratingId: r.rating_id as string,
      category: r.category as string,
      score: r.score as number,
    }))
  }

  getAverageScoresByProject(projectId: string): { category: string; avgScore: number; count: number }[] {
    const rows = this.db.prepare(`
      SELECT rcs.category, AVG(rcs.score) as avg_score, COUNT(rcs.id) as cnt
      FROM rating_category_scores rcs
      JOIN ratings r ON rcs.rating_id = r.id
      WHERE r.project_id = ? AND r.status = 'published'
      GROUP BY rcs.category
      ORDER BY avg_score DESC
    `).all(projectId) as Record<string, unknown>[]
    return rows.map((r) => ({
      category: r.category as string,
      avgScore: Math.round((r.avg_score as number) * 10) / 10,
      count: r.cnt as number,
    }))
  }

  private rowToRating(row: Record<string, unknown>): Rating {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      period: row.period as Rating['period'],
      stayType: row.stay_type as Rating['stayType'],
      categories: JSON.parse(row.categories as string || '[]'),
      facilitiesInside: JSON.parse(row.facilities_inside as string || '[]'),
      facilitiesNearby: JSON.parse(row.facilities_nearby as string || '[]'),
      impression: row.impression as string,
      title: row.title as string,
      sleepType: row.sleep_type as string | null,
      rank: row.rank as string | null,
      ageGroup: row.age_group as string | null,
      familyStatus: row.family_status as string | null,
      firstName: row.first_name as string,
      email: row.email as string,
      status: row.status as Rating['status'],
      verificationCode: row.verification_code as string | null,
      verifiedAt: row.verified_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      synced: row.synced === 1,
    }
  }

  // ── Sync Queue ─────────────────────────────────────────────────────────────

  addToSyncQueue(entityType: string, entityId: string, action: string, payload: object): void {
    this.db.prepare(`
      INSERT INTO sync_queue (entity_type, entity_id, action, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(entityType, entityId, action, JSON.stringify(payload), new Date().toISOString())
  }

  getPendingSyncItems(limit: number = 50): SyncQueueItem[] {
    const rows = this.db.prepare(
      'SELECT * FROM sync_queue WHERE attempts < 5 ORDER BY created_at ASC LIMIT ?'
    ).all(limit) as Record<string, unknown>[]

    return rows.map((r) => ({
      id: r.id as number,
      entityType: r.entity_type as SyncQueueItem['entityType'],
      entityId: r.entity_id as string,
      action: r.action as SyncQueueItem['action'],
      payload: JSON.parse(r.payload as string),
      createdAt: r.created_at as string,
      attempts: r.attempts as number,
      lastError: r.last_error as string | undefined,
    }))
  }

  removeSyncQueueItem(id: number): void {
    this.db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id)
  }

  incrementSyncAttempts(id: number, error: string): void {
    this.db.prepare('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?').run(error, id)
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getUnsyncedCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM sync_queue WHERE attempts < 5').get() as { cnt: number }
    return row.cnt
  }

  clearFailedSyncItems(): number {
    const result = this.db.prepare('DELETE FROM sync_queue WHERE attempts >= 5').run()
    return result.changes
  }
}

export const localDatabase = new LocalDatabase()

export interface OrchestratorState {
  connected: boolean
  claudeRunning: boolean
  activeSessions: number
  userToken: string | null
  backendUrl: string | null
  userEmail: string | null
  planName: string | null
  lastConnectedAt: string | null
  version: string
}

export interface IncomingMessage {
  type: 'run_agent' | 'stop_agent' | 'ping' | 'config_update'
  agentId: string
  sessionId: string
  prompt?: string
  config?: AgentConfig
}

export interface OutgoingMessage {
  type: 'output' | 'completed' | 'error' | 'status' | 'pong' | 'connected'
  agentId?: string
  sessionId?: string
  data?: string
  error?: string
  state?: OrchestratorState
  timestamp: number
}

export interface AgentConfig {
  systemPrompt?: string
  maxTokens?: number
  tools?: string[]
  workingDirectory?: string
  timeout?: number
}

export interface StoredSettings {
  backendUrl: string
  userToken: string
  autoStart: boolean
  minimizeToTray: boolean
  claudePath: string
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  sessionId?: string
}

// ── Chat / Project Types ─────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description?: string
  metadata?: Record<string, string>
  createdAt: string
  updatedAt: string
  agents: ProjectAgent[]
  synced?: boolean
  remoteId?: number
}

export interface GlobalAgent {
  id: string
  name: string
  title?: string
  mentionKey: string
  systemPrompt: string
  color: string
  avatar?: string
  /** LLM model alias ('sonnet' | 'opus' | 'haiku'). Falls back to DEFAULT_AGENT_MODEL when unset. */
  model?: string
  /** Thinking depth passed as `claude --effort <level>`. Falls back to DEFAULT_AGENT_EFFORT when unset. */
  effort?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectAgent {
  id: string
  projectId: string
  globalAgentId?: string
  name: string
  title?: string
  mentionKey: string
  systemPrompt: string
  color: string
  avatar?: string
  /** LLM model alias ('sonnet' | 'opus' | 'haiku'). Falls back to DEFAULT_AGENT_MODEL when unset. */
  model?: string
  /** Thinking depth passed as `claude --effort <level>`. Falls back to DEFAULT_AGENT_EFFORT when unset. */
  effort?: string
  sortOrder: number
  status: 'idle' | 'thinking' | 'responding'
  currentTool?: string
  /**
   * User-triggered kill switch. A stopped agent never gets a new Claude run — not from chat
   * and not from the autonomous goal loop — until it is explicitly resumed. Persisted, so it
   * also survives an app restart (goal resume included).
   */
  stopped?: boolean
}

export interface MessageAttachment {
  id: string
  fileName: string
  mimeType: string
  localPath: string
  size: number
}

export interface ChatMessage {
  id: string
  projectId: string
  role: 'user' | 'agent'
  agentLocalId?: string
  agentName?: string
  content: string
  thinkingContent?: string
  mentions: string[]
  replyToLocalId?: string
  sessionId?: string
  status: 'sending' | 'streaming' | 'done' | 'error' | 'stopped'
  errorCode?: 'timeout' | 'spawn_failed' | 'exit_code' | 'unknown'
  metadata?: Record<string, string>
  attachments?: MessageAttachment[]
  clientTimestamp: string
  synced?: boolean
}

// ── Project Documents ────────────────────────────────────────────────────────

export interface ProjectDocument {
  id: string
  projectId: string
  title: string
  content: string
  createdByAgentId?: string
  createdByAgentName?: string
  updatedByAgentId?: string
  updatedByAgentName?: string
  createdAt: string
  updatedAt: string
  synced?: boolean
}

export type TicketStatus = 'open' | 'in_progress' | 'done'
export type TicketCategory = 'bug' | 'feature' | 'task' | 'improvement' | 'documentation' | 'question' | 'epic'

export const TICKET_CATEGORIES: { value: TicketCategory; label: string; color: string }[] = [
  { value: 'bug', label: 'Bug', color: '#ef4444' },
  { value: 'feature', label: 'Feature', color: '#8b5cf6' },
  { value: 'task', label: 'Task', color: '#60a5fa' },
  { value: 'improvement', label: 'Verbesserung', color: '#f59e0b' },
  { value: 'documentation', label: 'Dokumentation', color: '#06b6d4' },
  { value: 'question', label: 'Frage', color: '#ec4899' },
  { value: 'epic', label: 'Epic', color: '#6366f1' },
]

export interface Ticket {
  id: string
  projectId: string
  ticketNumber: number
  title: string
  description?: string
  status: TicketStatus
  category?: TicketCategory
  assignedAgentLocalId?: string
  assignedAgentName?: string
  goalId?: number
  externalId?: string
  epicId?: string
  /** IDs of tickets that must be done before this one (from ticket_dependencies) */
  dependsOnIds?: string[]
  sortOrder: number
  comments: TicketComment[]
  attachments?: MessageAttachment[]
  createdAt: string
  updatedAt: string
  synced?: boolean
}

export interface TicketComment {
  id: string
  ticketId: string
  projectId: string
  authorType: 'user' | 'agent'
  agentLocalId?: string
  agentName?: string
  content: string
  clientTimestamp: string
  synced?: boolean
}

export interface TicketGroups {
  open: Ticket[]
  in_progress: Ticket[]
  done: Ticket[]
}

// ── Agent Memory ─────────────────────────────────────────────────────────

export interface AgentMemory {
  id: number
  globalAgentId: string
  projectId: string | null
  key: string
  value: string
  importance: 1 | 2 | 3
  source: 'agent' | 'user'
  accessCount: number
  lastAccessedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── Project Goals (Autonomous Loop) ──────────────────────────────────────

export type GoalStatus = 'pending' | 'planning' | 'in_progress' | 'reviewing' | 'done' | 'cancelled' | 'failed'
export type GoalPhase = 'pflichtenheft' | 'ticket_creation' | 'ticket_work' | 'review' | 'done'
export type GoalErrorType = 'agent_not_found' | 'rate_limit' | 'timeout' | 'phase_error' | 'max_retries' | 'unknown'

/**
 * 'ai'       — classic pipeline: description → Pflichtenheft → auto tickets → work → review
 * 'selected' — user hand-picks existing tickets; only the work phase runs (with runtime dependencies)
 */
export type GoalMode = 'ai' | 'selected'

export interface GoalCheckpoint {
  completedTicketIds?: string[]
  /** Ticket IDs currently being worked on right now (for live "which ticket runs" display) */
  activeTicketIds?: string[]
  retryAtCheckpoint?: number
  rateLimitResumeAt?: string
}

export interface ProjectGoal {
  id: number
  projectId: string
  title: string
  description: string
  status: GoalStatus
  mode?: GoalMode
  pflichtenheftDocumentId?: string
  currentPhase?: GoalPhase
  selectedAgentIds?: string[]
  retryCount: number
  errorType?: GoalErrorType
  errorMessage?: string
  checkpointData?: GoalCheckpoint
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface GoalRunLog {
  id: number
  goalId: number
  step: GoalPhase
  agentName?: string
  ticketId?: string
  message: string
  status: 'running' | 'success' | 'failed'
  errorType?: GoalErrorType
  createdAt: string
}

export interface GoalPhaseUpdate {
  goalId: number
  phase: GoalPhase
  status: 'running' | 'success' | 'failed'
  message: string
}

// ── Rating / Bewertungssystem ────────────────────────────────────────────

export type RatingPeriod = 'unter_1_monat' | '1_3_monate' | '3_6_monate' | '6_12_monate' | 'ueber_12_monate'
export type RatingStayType = 'stationiert' | 'kommandiert' | 'durchreise'
export type RatingStatus = 'draft' | 'pending_verification' | 'published' | 'rejected'

export interface Rating {
  id: string
  projectId: string
  period: RatingPeriod
  stayType: RatingStayType
  categories: string[]
  facilitiesInside: string[]
  facilitiesNearby: string[]
  impression: string
  title: string
  sleepType: string | null
  rank: string | null
  ageGroup: string | null
  familyStatus: string | null
  firstName: string
  email: string
  status: RatingStatus
  verificationCode: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
  synced?: boolean
}

export interface RatingCategoryScore {
  id: number
  ratingId: string
  category: string
  score: number
}

export interface SyncQueueItem {
  id: number
  entityType: 'project' | 'agent' | 'message' | 'ticket' | 'ticket_comment' | 'document' | 'rating'
  entityId: string
  action: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
  lastError?: string
}

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  unsyncedCount: number
  lastSyncAt: string | null
}

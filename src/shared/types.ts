import type {
  AgentEffort,
  AgentRole,
  GoalStatus,
  TicketCategory,
  TicketStatus,
} from './constants'
import type { Language } from './i18n/types'

/** Frei geformter JSON-Blob, wie er in `metadata`-Spalten liegt. */
export type JsonObject = Record<string, unknown>

export interface Project {
  id: string
  name: string
  description: string | null
  /** Absoluter Pfad des Repos auf der Platte — wird als `cwd` der Claude-CLI benutzt. */
  path: string | null
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  name: string
  title: string | null
  /** Erwähnungskürzel inklusive `@`, z.B. `@lena`. */
  mentionKey: string
  role: AgentRole
  systemPrompt: string
  model: string
  effort: AgentEffort
  color: string
  avatar: string | null
  /** Zugewiesene Skills — jeder Lauf bekommt genau diese über `--plugin-dir`. */
  skillIds: string[]
  createdAt: string
  updatedAt: string
}

/**
 * Anweisungspaket im Claude-Code-Sinn. Claude sieht pro Lauf nur Name und Beschreibung und
 * lädt den Inhalt erst, wenn die Beschreibung auf die Aufgabe passt.
 */
export interface Skill {
  id: string
  name: string
  /** Verzeichnis- und Aufrufname: klein, nur `[a-z0-9-]`, global eindeutig. */
  slug: string
  description: string
  /** Rumpf der `SKILL.md` ohne Frontmatter — bearbeitbar im Editor. */
  content: string
  /** Beidateien (`references/…`, `assets/…`) — liegen auf der Platte, nur anzeig- und entfernbar. */
  files: SkillFile[]
  createdAt: string
  updatedAt: string
}

export interface SkillFile {
  id: string
  /** Relativ zur `SKILL.md`, Groß- und Kleinschreibung wie beim Import — der Rumpf verweist so. */
  relPath: string
  size: number
  createdAt: string
}

/** Was ein gelesener, noch nicht gespeicherter Import enthält — Grundlage der Vorschau. */
export interface SkillImportPreview {
  token: string
  name: string
  /** Bereits normalisiert und eindeutig; beim Bestätigen wird erneut geprüft. */
  slug: string
  description: string
  contentLength: number
  files: { relPath: string; size: number }[]
}

/** Ein Agent in seiner Rolle innerhalb eines Projekts (Join über `project_agents`). */
export interface ProjectAgent extends Agent {
  projectId: string | null
  sortOrder: number
  stopped: boolean
}

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped'

export interface MessageAttachment {
  id: string
  messageId: string | null
  ticketId: string | null
  fileName: string
  mimeType: string | null
  /** Pfad relativ zu `userData/attachments`, ausgeliefert über `attachment://`. */
  relativePath: string
  size: number
  createdAt: string
}

export interface ChatMessage {
  id: string
  projectId: string
  role: MessageRole
  agentId: string | null
  content: string
  thinking: string | null
  /** Erwähnte Agent-IDs in Reihenfolge des Auftretens. */
  mentions: string[]
  replyToId: string | null
  status: MessageStatus
  errorCode: string | null
  metadata: JsonObject
  createdAt: string
  attachments: MessageAttachment[]
}

export interface Ticket {
  id: string
  projectId: string
  number: number
  title: string
  description: string | null
  status: TicketStatus
  category: TicketCategory
  assignedAgentId: string | null
  goalId: number | null
  /** Kennung aus einem fremden System, z.B. beim JSON-Import. */
  externalId: string | null
  epicId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type TicketAuthorType = 'user' | 'agent'

export interface TicketComment {
  id: string
  ticketId: string
  authorType: TicketAuthorType
  agentId: string | null
  content: string
  createdAt: string
}

export interface TicketDetail extends Ticket {
  comments: TicketComment[]
  /** IDs der Tickets, von denen dieses Ticket abhängt. */
  dependencies: string[]
  /** IDs der Tickets, die auf dieses Ticket warten. */
  dependents: string[]
  attachments: MessageAttachment[]
}

export interface ProjectDocument {
  id: string
  projectId: string
  title: string
  content: string
  createdByAgentId: string | null
  updatedByAgentId: string | null
  createdAt: string
  updatedAt: string
}

export type MemorySource = 'agent' | 'user'

export interface AgentMemory {
  id: number
  agentId: string
  projectId: string | null
  key: string
  value: string
  /** 1 = beiläufig, 2 = normal, 3 = wichtig. */
  importance: number
  source: MemorySource
  accessCount: number
  lastAccessedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GoalMode = 'ai' | 'selected'

export interface Goal {
  id: number
  projectId: string
  title: string
  description: string | null
  mode: GoalMode
  status: GoalStatus
  phase: string | null
  specDocumentId: string | null
  selectedAgentIds: string[]
  checkpoint: JsonObject | null
  retryCount: number
  errorType: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type GoalLogStatus = 'running' | 'success' | 'failed'

export interface GoalLogEntry {
  id: number
  goalId: number
  phase: string | null
  agentId: string | null
  ticketId: string | null
  message: string
  status: GoalLogStatus
  createdAt: string
}

/** Wiederverwendbare Claude-CLI-Session, damit der Prompt-Cache warm bleibt. */
export interface ClaudeSession {
  scopeKey: string
  sessionId: string
  cwd: string | null
  turnCount: number
  createdAt: string
  lastUsedAt: string
}

export interface ClaudeStatus {
  available: boolean
  path: string | null
  version: string | null
  error: string | null
  checkedAt: string
}

export interface AppSettings {
  claudePath: string | null
  minimizeToTray: boolean
  notificationsEnabled: boolean
  /** Sprache der Oberfläche und der Texte, die der Main-Prozess erzeugt. */
  language: Language
  /** Fernzugriff-Brücke. Standardmäßig aus — ohne Schalter lauscht nichts. */
  remoteEnabled: boolean
  remotePort: number
  /** Verzeichnis mit dem Bau der Weboberfläche; leer heißt `userData/webui`. */
  webuiPath: string | null
}

/** Laufzeitzustand der Fernzugriff-Brücke, nicht gespeichert. */
export interface RemoteStatus {
  enabled: boolean
  running: boolean
  port: number | null
  /** Adressen zum Abtippen am Telefon, inklusive Port und Schema. */
  addresses: string[]
  clientCount: number
  staticRoot: string
  contractVersion: string
  error: string | null
}

export interface AppInfo {
  name: string
  version: string
  electronVersion: string
  platform: string
  databasePath: string
  databaseDirectory: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  level: LogLevel
  scope: string
  message: string
  data: JsonObject | null
  timestamp: string
}

/** Laufzeitzustand eines Agenten im Chat, getrennt von der Nachricht selbst. */
export type AgentActivity = 'idle' | 'thinking' | 'writing' | 'tool' | 'error'

export interface AgentStatusUpdate {
  projectId: string
  agentId: string
  activity: AgentActivity
  detail: string | null
  messageId: string | null
}

export type { AgentEffort, AgentRole, GoalStatus, TicketCategory, TicketStatus }

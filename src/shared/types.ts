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

export type McpTransport = 'http' | 'sse' | 'stdio'

/**
 * Ein externer MCP-Server. Global definiert, Projekten zugewiesen — der `name` ist zugleich
 * das Werkzeug-Präfix der CLI (`mcp__<name>__…`).
 *
 * Header- und Umgebungswerte stehen hier **nicht**: sie können Zugangsdaten enthalten, liegen
 * mit `safeStorage` verschlüsselt in der Datenbank und verlassen den Main-Prozess nie. Die
 * Oberfläche kennt nur die Schlüssel.
 */
export interface McpServer {
  id: string
  name: string
  transport: McpTransport
  /** Bei `http` und `sse`. */
  url: string | null
  /** Bei `stdio`. */
  command: string | null
  args: string[]
  headerKeys: string[]
  envKeys: string[]
  description: string
  /** Werkzeuganzahl des letzten „Prüfen"-Laufs, `null` wenn noch nie geprüft. */
  toolCount: number | null
  checkedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Was der „Prüfen"-Knopf vom Server erfährt. */
export interface McpProbeResult {
  serverName: string | null
  serverVersion: string | null
  toolNames: string[]
  /**
   * Länge des `instructions`-Texts in Zeichen, `null` wenn der Server keinen mitschickt.
   * Dieser Text geht in jeden Lauf — bei Unity ist er der größte Einzelposten.
   */
  instructionsLength: number | null
  durationMs: number
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
  /** Das Vorgaben-Dokument des Ticketsets, aus dem dieses Ticket stammt. */
  guidelinesDocumentId: string | null
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
  /**
   * Ob Agenten von sich aus Tests schreiben und ausführen dürfen. Standardmäßig aus: der
   * Zurückhaltungsblock verbietet es dann zusätzlich in Großschreibung.
   */
  agentsMayWriteTests: boolean
  /** Fernzugriff-Brücke. Standardmäßig aus — ohne Schalter lauscht nichts. */
  remoteEnabled: boolean
  remotePort: number
  /** Verzeichnis mit dem Bau der Weboberfläche; leer heißt `userData/webui`. */
  webuiPath: string | null
  /** APNs-Versand. Standardmäßig aus — ohne Schalter wird nichts gebaut und nichts geschickt. */
  pushEnabled: boolean
  /** `auto` nimmt die Umgebung, die das Gerät bei der Anmeldung genannt hat. */
  pushEnvironment: PushEnvironmentChoice
  pushTriggers: PushTriggers
}

/** APNs kennt zwei getrennte Welten mit getrennten Gerätetoken. */
export type PushEnvironment = 'sandbox' | 'production'

export type PushEnvironmentChoice = 'auto' | PushEnvironment

/**
 * Welche Anlässe eine Meldung wert sind. `chatDone` ist aus: ein beendeter Agentenlauf im
 * Chat kommt oft genug, dass daraus sonst Dauerfeuer wird.
 */
export interface PushTriggers {
  goalDone: boolean
  goalFailed: boolean
  goalCancelled: boolean
  ticketStuck: boolean
  rateLimit: boolean
  chatDone: boolean
  liveActivity: boolean
  /** A3: ein Agent hat eine Rückfrage gestellt und wartet auf eine Antwort. */
  questionAsked: boolean
}

/**
 * Ein angemeldetes iPhone. Der Gerätetoken ist kein Geheimnis des Developer-Kontos und bleibt
 * sichtbar — die Oberfläche braucht ihn als Schlüssel zum Entfernen. Das Activity-Token
 * verlässt den Main-Prozess nicht, von ihm kommt nur zurück, ob es da ist.
 */
export interface PushDevice {
  deviceToken: string
  bundleId: string
  environment: PushEnvironment
  hasActivityToken: boolean
  registeredAt: string
  /** Zeitstempel des letzten Kontakts, also der letzten Anmeldung.  */
  lastSeenAt: string
  lastPushAt: string | null
  lastPushKind: string | null
  lastPushError: string | null
}

/**
 * Laufzeitzustand des Versands, nicht gespeichert. `.p8`, Key-ID und Team-ID stehen hier
 * **nicht** — sie gehen nie über IPC zurück, nur die Auskunft, ob sie hinterlegt sind.
 */
export interface PushStatus {
  enabled: boolean
  /** Alle drei Angaben liegen vor, der Versand kann also überhaupt losgehen. */
  configured: boolean
  hasKey: boolean
  hasKeyId: boolean
  hasTeamId: boolean
  /** Dateiname des hinterlegten `.p8` — zur Wiedererkennung, nicht sein Inhalt. */
  keyFileName: string | null
  deviceCount: number
  lastSentAt: string | null
  lastError: string | null
  safeStorageAvailable: boolean
}

/** Status und Geräteliste in einem Zug — so kommt beides beim Ereignis `push.changed` an. */
export interface PushSnapshot {
  status: PushStatus
  devices: PushDevice[]
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

/**
 * Wie ein Lauf geendet hat. `aborted` ist kein Fehler, sondern ein Abbruch durch den Nutzer,
 * und `rate_limited` ist noch kein Ende: nach der Pause läuft derselbe Schritt als neuer Lauf.
 */
export type RunOutcome = 'done' | 'aborted' | 'failed' | 'rate_limited'

/**
 * Eine Zeile der Live-Übersicht: ein Lauf, der gerade läuft. Projekt-, Agenten-, Vorhaben-
 * und Ticketname stehen mit drin, weil die Übersicht alle Projekte gleichzeitig zeigt und
 * sonst für jede Zeile nachladen müsste.
 */
export interface ActiveRun {
  id: string
  projectId: string
  projectName: string
  agentId: string
  agentName: string
  model: string
  /** Woher der Lauf kommt: `chat`, `goal-worker`, `goal-spec`, `goal-review`, … */
  label: string | null
  goalId: number | null
  goalTitle: string | null
  ticketId: string | null
  ticketNumber: number | null
  ticketTitle: string | null
  startedAt: string
  /** Beschriftung des laufenden Werkzeugs; `null`, solange der Agent überlegt. */
  tool: string | null
  /** Seit wann dieser Werkzeugzustand anhält. */
  toolSince: string
  /**
   * Die Rückfrage, auf deren Antwort dieser Lauf wartet (A3). Ein wartender Lauf ist beendet,
   * bleibt in der Übersicht aber stehen — sonst wäre er von einem fertigen nicht zu
   * unterscheiden. `null`, solange der Lauf selbst arbeitet.
   */
  waitingQuestionId: string | null
  /** Seit wann gewartet wird. Die Laufzeitspalte zählt dann ab hier, nicht ab `startedAt`. */
  waitingSince: string | null
}

export type { AgentEffort, AgentRole, GoalStatus, TicketCategory, TicketStatus }

// ---------------------------------------------------------------------------
// A3 — Rückfragen
// ---------------------------------------------------------------------------

/**
 * `open` wartet auf eine Antwort, `answered` hat eine, `discarded` hat der Nutzer verworfen
 * und `expired` ist nach sieben Tagen unbeantwortet geschlossen worden.
 */
export type QuestionStatus = 'open' | 'answered' | 'discarded' | 'expired'

/**
 * Eine Rückfrage eines Agenten. Sie ist der ganze Zustand eines wartenden Laufs: der Lauf
 * selbst endet, sobald die Frage angelegt ist, und wird aus dieser Zeile heraus später
 * wieder aufgenommen.
 */
export interface AgentQuestion {
  id: string
  projectId: string
  agentId: string
  /** Scope des fragenden Laufs; beide `null` heißt, die Frage kam aus dem Chat. */
  goalId: number | null
  ticketId: string | null
  /** Nummer des Tickets, mitgelesen zur Anzeige. `null`, wenn die Frage an keinem hängt. */
  ticketNumber: number | null
  question: string
  /** Was der Agent zur Lage gesagt hat — damit die Frage ohne Rückblick zu beantworten ist. */
  context: string | null
  /** Vorgeschlagene Antworten, höchstens sechs. Freitext bleibt immer möglich. */
  options: string[]
  status: QuestionStatus
  answer: string | null
  askedAt: string
  answeredAt: string | null
  /** Ab diesem Zeitpunkt gilt die Frage als unbeantwortet geschlossen. */
  expiresAt: string
}

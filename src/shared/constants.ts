export const APP_NAME = 'Orchestrator Agent'

export const WINDOW_DEFAULT_WIDTH = 1440
export const WINDOW_DEFAULT_HEIGHT = 920
export const WINDOW_MIN_WIDTH = 1040
export const WINDOW_MIN_HEIGHT = 680

/** Hintergrundfarbe des Fensters, muss zur Tailwind-Farbe `base` passen. */
export const WINDOW_BACKGROUND = '#0b0b0d'

export type AgentModelGroup = 'Opus' | 'Sonnet' | 'Haiku'

export interface AgentModelOption {
  value: string
  label: string
  group: AgentModelGroup
}

export const AGENT_MODELS: readonly AgentModelOption[] = [
  { value: 'claude-opus-5', label: 'Opus 5', group: 'Opus' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5', group: 'Sonnet' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5', group: 'Haiku' },
]

export const DEFAULT_AGENT_MODEL = 'claude-sonnet-5'

export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface AgentEffortOption {
  value: AgentEffort
  label: string
}

export const AGENT_EFFORTS: readonly AgentEffortOption[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'xhigh', label: 'Sehr hoch' },
  { value: 'max', label: 'Maximum' },
]

export const DEFAULT_AGENT_EFFORT: AgentEffort = 'medium'

/** Modelle, die den Effort-Parameter nicht kennen — dort wird er weggelassen. */
const MODELS_WITHOUT_EFFORT: readonly string[] = [
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku',
  'claude-3-5-sonnet',
  'claude-3-7-sonnet',
  'claude-sonnet-4',
  'claude-sonnet-4-5',
]

/**
 * Liefert den Effort-Level, den die CLI für dieses Modell akzeptiert — oder `null`,
 * wenn das Modell den Parameter nicht kennt. Frei eingetippte Modell-IDs, die wir nicht
 * kennen, werden unverändert durchgereicht.
 */
export function resolveEffortForModel(model: string, effort: string | null | undefined): string | null {
  if (!effort) return null
  const normalized = model.trim().toLowerCase()
  if (MODELS_WITHOUT_EFFORT.some((id) => normalized === id || normalized.startsWith(`${id}-`))) {
    return null
  }
  return effort
}

export type AgentRole = 'worker' | 'planner' | 'pm' | 'reviewer'

export interface AgentRoleOption {
  value: AgentRole
  label: string
  description: string
}

export const AGENT_ROLES: readonly AgentRoleOption[] = [
  { value: 'worker', label: 'Umsetzung', description: 'Arbeitet Tickets im Repo ab.' },
  { value: 'planner', label: 'Planung', description: 'Schreibt das Pflichtenheft und zerlegt Vorhaben in Tickets.' },
  { value: 'pm', label: 'Projektleitung', description: 'Verteilt Tickets und behält den Fortschritt im Blick.' },
  { value: 'reviewer', label: 'Review', description: 'Prüft fertige Arbeit und meldet Nacharbeit zurück.' },
]

export type TicketCategory =
  | 'bug'
  | 'feature'
  | 'task'
  | 'improvement'
  | 'documentation'
  | 'question'
  | 'epic'

export interface TicketCategoryOption {
  value: TicketCategory
  label: string
  color: string
}

export const TICKET_CATEGORIES: readonly TicketCategoryOption[] = [
  { value: 'bug', label: 'Fehler', color: '#e5645f' },
  { value: 'feature', label: 'Funktion', color: '#5b8dee' },
  { value: 'task', label: 'Aufgabe', color: '#9aa5b3' },
  { value: 'improvement', label: 'Verbesserung', color: '#4ac08a' },
  { value: 'documentation', label: 'Dokumentation', color: '#58a6c9' },
  { value: 'question', label: 'Frage', color: '#b98ce0' },
  { value: 'epic', label: 'Epic', color: '#e3b341' },
]

export type TicketStatus = 'open' | 'in_progress' | 'done'

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
}

export type GoalStatus =
  | 'pending'
  | 'planning'
  | 'in_progress'
  | 'reviewing'
  | 'done'
  | 'cancelled'
  | 'failed'

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  pending: 'Wartet',
  planning: 'Planung',
  in_progress: 'In Arbeit',
  reviewing: 'Review',
  done: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
  failed: 'Fehlgeschlagen',
}

/** Nach so vielen Turns wird eine Claude-CLI-Session in Rente geschickt. */
export const SESSION_MAX_TURNS = 40

export const AGENT_COLORS: readonly string[] = [
  '#5b8dee',
  '#4ac08a',
  '#e3b341',
  '#e5645f',
  '#b98ce0',
  '#58a6c9',
  '#e08a5b',
  '#7fb069',
]

/**
 * Dateiendungen, die als Anhang zur Prüfung durchgehen. Geprüft wird die Endung, nicht der
 * MIME-Typ: Beim Ablegen aus dem Finder ist `File.type` für `.md` und `.log` oft leer.
 */
export const ATTACHMENT_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.md',
  '.markdown',
  '.txt',
  '.html',
  '.htm',
  '.json',
  '.csv',
  '.log',
  '.yml',
  '.yaml',
  '.pdf',
]

/** Wert für `accept` am Datei-Dialog. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.join(',')

/**
 * Der Weg durch IPC läuft über Base64 im Renderer-Thread — größere Dateien würden die
 * Oberfläche für Sekunden blockieren.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

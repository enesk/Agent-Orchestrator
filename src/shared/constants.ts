export const APP_NAME = 'Orchestrator Agent'
export const APP_VERSION = '1.0.0'

export const DEFAULT_BACKEND_URL = 'wss://localhost:8080/ws'
export const DEFAULT_CLAUDE_PATH = '/usr/local/bin/claude'

export const RECONNECT_INTERVAL_MS = 5000
export const PING_INTERVAL_MS = 30000
export const MAX_LOG_ENTRIES = 500

export const WINDOW_WIDTH = 1200
export const WINDOW_HEIGHT = 750
export const WINDOW_MIN_WIDTH = 900
export const WINDOW_MIN_HEIGHT = 550

// ── Agent LLM models ────────────────────────────────────────────────────────
// Model is configurable per agent, down to the specific version. We store the exact
// model id passed to `claude --model <id>`. The picker offers the versions below,
// grouped by tier; a "custom" text field lets users enter any id their CLI supports
// (e.g. a newer release or a pinned legacy snapshot) without a code change.
export const AGENT_MODELS = [
  // Sonnet — ausgewogen, gutes Preis-/Leistungsverhältnis
  { value: 'claude-sonnet-5', label: 'Sonnet 5 — schnell & günstig (empfohlen)', group: 'Sonnet' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', group: 'Sonnet' },
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5', group: 'Sonnet' },
  // Opus — höchste Qualität, teuer
  { value: 'claude-opus-5', label: 'Opus 5 — neueste, stärkste', group: 'Opus' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8', group: 'Opus' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7', group: 'Opus' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6', group: 'Opus' },
  { value: 'claude-opus-4-5', label: 'Opus 4.5', group: 'Opus' },
  // Haiku — am günstigsten
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — am günstigsten', group: 'Haiku' },
  // Fable — maximale Fähigkeit, höchste Kosten
  { value: 'claude-fable-5', label: 'Fable 5 — max. Fähigkeit, sehr teuer', group: 'Fable' },
] as const

export type AgentModel = (typeof AGENT_MODELS)[number]['value']

// Ordered list of the tier groups, for rendering <optgroup>s.
export const AGENT_MODEL_GROUPS: string[] = AGENT_MODELS.reduce<string[]>((groups, m) => {
  if (!groups.includes(m.group)) groups.push(m.group)
  return groups
}, [])

// New agents default to Sonnet 5 to keep token cost low; users opt into Opus per agent.
export const DEFAULT_AGENT_MODEL: string = 'claude-sonnet-5'

// ── Agent effort levels ─────────────────────────────────────────────────────
// Second cost/quality dial next to the model: passed as `claude --effort <level>`.
// It controls how deeply the model thinks and how much it does per turn — lower
// effort means fewer, more consolidated tool calls and less preamble.
// Not every model supports every level (Sonnet 4.5 / Haiku 4.5 have no effort at
// all, Opus 4.6 / Sonnet 4.6 have no 'xhigh'), so the CLI is the authority here —
// an unsupported combination fails at spawn time, not at save time.
export const AGENT_EFFORTS = [
  { value: 'low', label: 'Low — günstig, für einfache Aufgaben' },
  { value: 'medium', label: 'Medium — sparsam, meist ausreichend' },
  { value: 'high', label: 'High — ausgewogen (empfohlen)' },
  { value: 'xhigh', label: 'XHigh — für Coding & Agenten-Aufgaben' },
  { value: 'max', label: 'Max — teuer, nur wenn Korrektheit alles ist' },
] as const

export type AgentEffort = (typeof AGENT_EFFORTS)[number]['value']

// New agents default to 'high' (the API default) rather than the Claude Code CLI
// default 'xhigh' — same reasoning as DEFAULT_AGENT_MODEL: start cheap, opt in.
// Agents that existed before this setting are backfilled to 'xhigh' by the schema
// migration so their behavior does not change silently.
export const DEFAULT_AGENT_EFFORT: string = 'high'

// Models that reject the effort parameter outright.
const MODELS_WITHOUT_EFFORT = ['claude-sonnet-4-5', 'claude-haiku-4-5']
// Models that support effort but not the 'xhigh' level (added with Opus 4.7).
const MODELS_WITHOUT_XHIGH = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5']

/**
 * Effort level to actually pass for this model, or null when the flag must be omitted.
 * Sending an unsupported level is a hard API error, and the model is free-text (custom
 * ids), so anything unknown is passed through as-is and left to the CLI to judge.
 */
export function resolveEffortForModel(model: string, effort: string): string | null {
  const id = model.trim()
  if (MODELS_WITHOUT_EFFORT.includes(id)) return null
  if (effort === 'xhigh' && MODELS_WITHOUT_XHIGH.includes(id)) return 'high'
  return effort
}

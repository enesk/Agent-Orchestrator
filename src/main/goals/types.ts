import type { JsonObject } from '@shared/types'

/** Die fünf Stationen eines Vorhabens. Die Oberfläche bildet den Namen auf ihre Leiste ab. */
export type GoalPhase = 'spec' | 'tickets' | 'work' | 'review' | 'done'

export interface ActiveAssignment {
  ticketId: string
  agentId: string
}

/**
 * Der Checkpoint ist der einzige Zustand, den ein Neustart wiederfindet — er muss also
 * alles enthalten, was die Fortsetzung und die Fortschrittsanzeige brauchen.
 */
export interface GoalCheckpoint extends JsonObject {
  phase: GoalPhase
  /** Tickets des Vorhabens zum Zeitpunkt des letzten Schritts. */
  ticketIds: string[]
  doneTicketIds: string[]
  activeTickets: ActiveAssignment[]
  totalTickets: number
  completedTickets: number
  /** Wie oft ein Ticket wegen einer Blockade zurück in die Warteschlange ging. */
  requeues: Record<string, number>
  /** Wie oft ein Ticket schon versucht wurde — überlebt einen Neustart. */
  attempts: Record<string, number>
  /** Welche Agenten ein Ticket schon hatten, in der Reihenfolge der Versuche. */
  triedAgents: Record<string, string[]>
  /** Tickets, die vorerst nicht weiter versucht werden — die Phase läuft ohne sie weiter. */
  stuckTicketIds: string[]
  /** Tickets, denen als Vorbedingung anderer schon einmal ein Neuanfang gewährt wurde. */
  revivedTicketIds: string[]
  /** Wann ein Rate-Limit-Halt frühestens weitergeht, als ISO-Zeitstempel. */
  resumeAt: string | null
}

export function emptyCheckpoint(phase: GoalPhase): GoalCheckpoint {
  return {
    phase,
    ticketIds: [],
    doneTicketIds: [],
    activeTickets: [],
    totalTickets: 0,
    completedTickets: 0,
    requeues: {},
    attempts: {},
    triedAgents: {},
    stuckTicketIds: [],
    revivedTicketIds: [],
    resumeAt: null,
  }
}

/** Liest einen gespeicherten Checkpoint defensiv — alte oder halbe Stände dürfen nicht werfen. */
export function readCheckpoint(raw: JsonObject | null, fallbackPhase: GoalPhase): GoalCheckpoint {
  const base = emptyCheckpoint(fallbackPhase)
  if (!raw) return base

  return {
    phase: isPhase(raw.phase) ? raw.phase : fallbackPhase,
    ticketIds: stringArray(raw.ticketIds),
    doneTicketIds: stringArray(raw.doneTicketIds),
    activeTickets: assignments(raw.activeTickets),
    totalTickets: typeof raw.totalTickets === 'number' ? raw.totalTickets : 0,
    completedTickets: typeof raw.completedTickets === 'number' ? raw.completedTickets : 0,
    requeues: counters(raw.requeues),
    attempts: counters(raw.attempts),
    triedAgents: stringLists(raw.triedAgents),
    stuckTicketIds: stringArray(raw.stuckTicketIds),
    revivedTicketIds: stringArray(raw.revivedTicketIds),
    resumeAt: typeof raw.resumeAt === 'string' ? raw.resumeAt : null,
  }
}

const PHASES: readonly GoalPhase[] = ['spec', 'tickets', 'work', 'review', 'done']

export function isPhase(value: unknown): value is GoalPhase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function assignments(value: unknown): ActiveAssignment[] {
  if (!Array.isArray(value)) return []
  const result: ActiveAssignment[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record.ticketId === 'string' && typeof record.agentId === 'string') {
      result.push({ ticketId: record.ticketId, agentId: record.agentId })
    }
  }
  return result
}

function stringLists(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string[]> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const list = stringArray(entry)
    if (list.length > 0) result[key] = list
  }
  return result
}

function counters(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) result[key] = entry
  }
  return result
}

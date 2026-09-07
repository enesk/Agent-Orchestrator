import { useEffect, useState } from 'react'
import { GOAL_STATUS_LABELS, type GoalStatus } from '@shared/constants'
import type { Goal, JsonObject, Ticket } from '@shared/types'
import type { BadgeTone } from '../../ui'

export type GoalPhaseKey = 'spec' | 'tickets' | 'work' | 'review' | 'done'

export interface GoalPhase {
  key: GoalPhaseKey
  label: string
}

export const GOAL_PHASES: readonly GoalPhase[] = [
  { key: 'spec', label: 'Pflichtenheft' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'work', label: 'Arbeit' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Fertig' },
]

const STATUS_TONES: Record<GoalStatus, BadgeTone> = {
  pending: 'neutral',
  planning: 'info',
  in_progress: 'accent',
  reviewing: 'info',
  done: 'success',
  cancelled: 'neutral',
  failed: 'danger',
}

const STATUS_PHASES: Record<GoalStatus, GoalPhaseKey> = {
  pending: 'spec',
  planning: 'spec',
  in_progress: 'work',
  reviewing: 'review',
  done: 'done',
  cancelled: 'work',
  failed: 'work',
}

/**
 * Die Engine aus T10 schreibt den Phasennamen als freien Text. Er wird hier auf die fünf
 * Stationen der Leiste abgebildet; passt nichts, entscheidet der Status.
 */
export function resolvePhase(goal: Goal): GoalPhaseKey {
  const raw = (goal.phase ?? '').toLowerCase()
  if (raw) {
    if (/(spec|pflichtenheft|plan)/.test(raw)) return 'spec'
    if (/(ticket|breakdown|zerleg)/.test(raw)) return 'tickets'
    if (/(work|implement|arbeit|umsetz|execut)/.test(raw)) return 'work'
    if (/(review|prüf|pruef|abnahme)/.test(raw)) return 'review'
    if (/(done|complete|finish|fertig|abgeschlossen)/.test(raw)) return 'done'
  }
  return STATUS_PHASES[goal.status]
}

export function phaseLabel(goal: Goal): string {
  const phase = GOAL_PHASES.find((entry) => entry.key === resolvePhase(goal))
  return phase?.label ?? '—'
}

export function goalStatusLabel(status: GoalStatus): string {
  return GOAL_STATUS_LABELS[status]
}

export function goalStatusTone(status: GoalStatus): BadgeTone {
  return STATUS_TONES[status]
}

const ACTIVE_STATUSES: readonly GoalStatus[] = ['pending', 'planning', 'in_progress', 'reviewing']

export function isGoalActive(goal: Goal): boolean {
  return ACTIVE_STATUSES.includes(goal.status)
}

/** Ein Rate-Limit ist keine Störung, sondern eine Pause — die UI meldet sie ruhig. */
export function isRateLimitPause(goal: Goal): boolean {
  const raw = `${goal.errorType ?? ''} ${goal.errorMessage ?? ''}`.toLowerCase()
  return /rate.?limit/.test(raw)
}

export interface TicketCounts {
  done: number
  total: number
}

/**
 * Die Ticketzahlen kommen aus den Tickets des Projekts, die auf das Vorhaben zeigen.
 * Solange keine geladen sind, greift der Zähler aus dem Checkpoint.
 */
export function ticketCounts(goal: Goal, tickets: Ticket[]): TicketCounts | null {
  const own = tickets.filter((ticket) => ticket.goalId === goal.id)
  if (own.length > 0) {
    return { done: own.filter((ticket) => ticket.status === 'done').length, total: own.length }
  }
  const total = readNumber(goal.checkpoint, ['totalTickets', 'ticketCount', 'total'])
  if (total === null) return null
  const done = readNumber(goal.checkpoint, ['completedTickets', 'doneTickets', 'completed']) ?? 0
  return { done, total }
}

export interface ActiveAssignment {
  ticketId: string
  agentId: string | null
}

/**
 * Aus dem Checkpoint des Vorhabens: welches Ticket gerade bei welchem Agenten liegt.
 * Die Engine steht noch aus, deshalb werden mehrere plausible Formen akzeptiert und
 * alles Unbekannte still ignoriert.
 */
export function readActiveAssignments(goal: Goal): ActiveAssignment[] {
  const checkpoint = goal.checkpoint
  if (!checkpoint) return []

  for (const key of ['activeTickets', 'active', 'inProgress', 'assignments', 'workers']) {
    const value = checkpoint[key]
    if (Array.isArray(value)) {
      const parsed = value.map(toAssignment).filter((entry): entry is ActiveAssignment => !!entry)
      if (parsed.length > 0) return parsed
    }
    if (isRecord(value)) {
      const parsed = Object.entries(value)
        .map(([ticketId, agent]) => ({ ticketId, agentId: toStringOrNull(agent) }))
        .filter((entry) => !!entry.ticketId)
      if (parsed.length > 0) return parsed
    }
  }
  return []
}

function toAssignment(value: unknown): ActiveAssignment | null {
  if (typeof value === 'string') return { ticketId: value, agentId: null }
  if (!isRecord(value)) return null
  const ticketId =
    toStringOrNull(value.ticketId) ?? toStringOrNull(value.ticket) ?? toStringOrNull(value.id)
  if (!ticketId) return null
  const agentId = toStringOrNull(value.agentId) ?? toStringOrNull(value.agent)
  return { ticketId, agentId }
}

function readNumber(checkpoint: JsonObject | null, keys: string[]): number | null {
  if (!checkpoint) return null
  for (const key of keys) {
    const value = checkpoint[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) return value.length
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

const TIME_FORMAT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : TIME_FORMAT.format(date)
}

/** Laufzeit eines Vorhabens; läuft es noch, zählt sie gegen `now`. */
export function formatDuration(goal: Goal, now: number): string {
  const start = new Date(goal.createdAt).getTime()
  if (Number.isNaN(start)) return '—'
  const end = goal.completedAt ? new Date(goal.completedAt).getTime() : now
  const seconds = Math.max(0, Math.round(((Number.isNaN(end) ? now : end) - start) / 1000))

  if (seconds < 60) return `${seconds} Sek`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} Min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} Std` : `${hours} Std ${rest} Min`
}

/** Tickt im Sekundentakt, damit laufende Vorhaben eine mitlaufende Dauer zeigen. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs])
  return now
}

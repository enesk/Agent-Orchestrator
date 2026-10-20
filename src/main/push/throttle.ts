import type { ActivityEvent, ActivityState } from './payload'

/**
 * Die Drosselung der Live-Activity-Aktualisierungen. ActivityKit begrenzt, wie oft eine
 * Activity per Push einen neuen Zustand bekommt — wer zu oft schickt, verliert nicht die
 * überzähligen, sondern irgendwelche. Also wird zusammengefasst: höchstens eine
 * Aktualisierung alle fünf Sekunden je Vorhaben, aber **sofort** bei einem Phasenwechsel und
 * am Ende.
 *
 * Reine Logik, ohne `electron` und ohne APNs: der Takt ist einspeisbar, damit der Test zehn
 * Ereignisse in zwei Sekunden ohne Warten durchspielen kann.
 */

export const ACTIVITY_MIN_INTERVAL_MS = 5_000

/**
 * `immediate` heißt: diese Aktualisierung ist nicht gesammelt worden, sondern geht sofort —
 * der Versender macht daraus `apns-priority: 10`. Ein zusammengefasster Zwischenstand
 * bekommt 5 und darf unterwegs warten.
 */
export type ActivitySend = (
  goalId: number,
  state: ActivityState,
  event: ActivityEvent,
  immediate: boolean,
) => void

export interface ThrottleClock {
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

const realClock: ThrottleClock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => {
    const handle = setTimeout(fn, ms)
    // Ein wartender Zwischenstand darf das Beenden der App nicht aufhalten.
    handle.unref?.()
    return handle
  },
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
}

interface Entry {
  lastSentAt: number
  pending: ActivityState | null
  timer: unknown
}

export class ActivityThrottle {
  private readonly entries = new Map<number, Entry>()

  constructor(
    private readonly send: ActivitySend,
    private readonly clock: ThrottleClock = realClock,
  ) {}

  /**
   * Ein neuer Zwischenstand. `important` ist der Phasenwechsel: der geht sofort raus, denn
   * genau dafür sieht man auf den Sperrbildschirm.
   */
  update(goalId: number, state: ActivityState, important = false): void {
    const now = this.clock.now()
    const entry = this.entries.get(goalId)

    if (!entry) {
      this.entries.set(goalId, { lastSentAt: now, pending: null, timer: null })
      this.send(goalId, state, 'update', true)
      return
    }

    if (important) {
      this.cancelTimer(entry)
      entry.pending = null
      entry.lastSentAt = now
      this.send(goalId, state, 'update', true)
      return
    }

    const elapsed = now - entry.lastSentAt
    if (elapsed >= ACTIVITY_MIN_INTERVAL_MS) {
      this.cancelTimer(entry)
      entry.pending = null
      entry.lastSentAt = now
      this.send(goalId, state, 'update', true)
      return
    }

    // Innerhalb des Fensters: nur merken. Der zuletzt gemerkte Stand gewinnt — ein
    // überholter Zwischenstand hat keinen Wert mehr.
    entry.pending = state
    if (entry.timer === null) {
      entry.timer = this.clock.setTimer(
        () => this.flush(goalId),
        ACTIVITY_MIN_INTERVAL_MS - elapsed,
      )
    }
  }

  /** Das Vorhaben ist fertig, abgebrochen oder gescheitert: sofort, und dann ist Schluss. */
  end(goalId: number, state: ActivityState): void {
    const entry = this.entries.get(goalId)
    if (entry) this.cancelTimer(entry)
    this.entries.delete(goalId)
    this.send(goalId, state, 'end', true)
  }

  /** Vergisst ein Vorhaben, ohne etwas zu schicken — etwa beim Ausschalten. */
  forget(goalId: number): void {
    const entry = this.entries.get(goalId)
    if (entry) this.cancelTimer(entry)
    this.entries.delete(goalId)
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.cancelTimer(entry)
    this.entries.clear()
  }

  /** Nur für den Test: wartet gerade ein Zwischenstand? */
  hasPending(goalId: number): boolean {
    return this.entries.get(goalId)?.pending !== null && this.entries.has(goalId)
  }

  private flush(goalId: number): void {
    const entry = this.entries.get(goalId)
    if (!entry) return
    entry.timer = null
    const state = entry.pending
    entry.pending = null
    if (!state) return
    entry.lastSentAt = this.clock.now()
    this.send(goalId, state, 'update', false)
  }

  private cancelTimer(entry: Entry): void {
    if (entry.timer === null) return
    this.clock.clearTimer(entry.timer)
    entry.timer = null
  }
}

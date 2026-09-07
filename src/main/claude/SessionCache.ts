import { SESSION_MAX_TURNS } from '@shared/constants'
import {
  deleteSession,
  getSession,
  recordTurn,
  saveSession,
  sessionScopeKey,
} from '../db/repositories/sessions'
import { scopedLogger } from '../Logger'
import { looksLikeResumeFailure } from './StreamParser'

const log = scopedLogger('claude.sessions')

export interface SessionScope {
  projectId: string
  agentId: string
  goalId?: number | null
  ticketId?: string | null
}

export interface AcquiredSession {
  /** Session-ID für `--resume`, oder `null` für einen Kaltstart. */
  resumeId: string | null
  turnCount: number
  /**
   * `true`, wenn dieser Lauf den Scope für sich hat und sein Ergebnis speichern darf.
   * Ein zweiter Lauf im selben Scope läuft kalt und schreibt nichts zurück.
   */
  owned: boolean
}

/**
 * Scopes, die gerade laufen. Zwei gleichzeitige Läufe dürfen nicht dasselbe CLI-Transkript
 * fortschreiben — die CLI serialisiert das nicht und das Ergebnis wäre ein vermischter Verlauf.
 */
const busyScopes = new Set<string>()

export function buildScopeKey(scope: SessionScope): string {
  return sessionScopeKey(scope)
}

/**
 * Reserviert den Scope und entscheidet, ob der Lauf warm (`--resume`) oder kalt startet.
 * Muss immer mit `release()` beendet werden.
 */
export function acquire(scopeKey: string, cwd: string): AcquiredSession {
  if (busyScopes.has(scopeKey)) {
    log.debug('Scope ist belegt, Lauf startet kalt', { scopeKey })
    return { resumeId: null, turnCount: 0, owned: false }
  }
  busyScopes.add(scopeKey)

  const session = getSession(scopeKey)
  if (!session) return { resumeId: null, turnCount: 0, owned: true }

  if (session.cwd && session.cwd !== cwd) {
    // Der Projektpfad hat sich geändert; das alte Transkript beschreibt ein anderes Repo.
    deleteSession(scopeKey)
    log.info('Arbeitsverzeichnis hat sich geändert, Session verworfen', { scopeKey })
    return { resumeId: null, turnCount: 0, owned: true }
  }

  if (session.turnCount >= SESSION_MAX_TURNS) {
    deleteSession(scopeKey)
    log.info('Session in Rente geschickt', { scopeKey, turnCount: session.turnCount })
    return { resumeId: null, turnCount: 0, owned: true }
  }

  return { resumeId: session.sessionId, turnCount: session.turnCount, owned: true }
}

export function release(scopeKey: string, owned: boolean): void {
  if (owned) busyScopes.delete(scopeKey)
}

/**
 * Schreibt die Session-ID eines erfolgreichen Laufs zurück und zählt den Turn hoch.
 * Läufe ohne Besitz (`owned: false`) schreiben nichts — sie würden dem Besitzer
 * seine Session-ID unter den Füßen wegziehen. Liefert den neuen Turn-Zähler.
 */
export function persist(
  scopeKey: string,
  sessionId: string | null,
  cwd: string,
  owned: boolean,
): number {
  if (!owned || !sessionId) return 0
  saveSession({ scopeKey, sessionId, cwd })
  return recordTurn(scopeKey)?.turnCount ?? 0
}

/**
 * Verwirft die Session, wenn der Fehler nach einem gescheiterten Resume aussieht — sonst
 * versucht der nächste Lauf dasselbe tote Transkript und die Schleife hört nie auf.
 */
export function discardOnResumeFailure(
  scopeKey: string,
  owned: boolean,
  message: string,
): boolean {
  if (!owned || !looksLikeResumeFailure(message)) return false
  deleteSession(scopeKey)
  log.warn('Resume ist fehlgeschlagen, Session verworfen', { scopeKey })
  return true
}

/** Nur für den Notfall: alle Reservierungen aufheben (z.B. nach einem harten Fehler). */
export function resetBusyScopes(): void {
  busyScopes.clear()
}

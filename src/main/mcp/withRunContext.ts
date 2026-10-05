import type { RunMcpConfig } from '../claude/ClaudeRunner'
import { buildMcpConfig } from './buildMcpConfig'
import {
  register,
  release,
  takeReport,
  type GoalReport,
  type RunContext,
} from './RunContextRegistry'

/** Was ein Lauf vom Werkzeugserver bekommt: die CLI-Konfiguration und seine Rückmeldung. */
export interface RunContextHandle {
  token: string
  mcp: RunMcpConfig
  /** Die Meldung aus `goal_report`, oder `null`. Muss vor dem Ende von `fn` geholt werden. */
  takeReport(): GoalReport | null
}

/**
 * Die schmale Fassade für Chat und Goal-Engine: registriert ein Token, baut die Konfiguration
 * und gibt das Token nach dem Lauf zuverlässig wieder frei.
 */
export async function withRunContext<T>(
  context: RunContext,
  fn: (handle: RunContextHandle) => Promise<T>,
): Promise<T> {
  const token = register(context)
  try {
    return await fn({
      token,
      mcp: buildMcpConfig(token, context.projectId),
      takeReport: () => takeReport(token),
    })
  } finally {
    release(token)
  }
}

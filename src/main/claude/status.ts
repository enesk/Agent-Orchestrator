import type { ClaudeStatus } from '@shared/types'
import { getSettings } from '../app/settings'
import { emitEvent } from '../ipc/events'
import { scopedLogger } from '../Logger'
import { status as probeStatus } from './ClaudeCli'
import { mainT } from '../app/settings'
import { RunError } from './RunError'

const log = scopedLogger('claude.cli')

let cached: ClaudeStatus | null = null
let inflight: Promise<ClaudeStatus> | null = null

/**
 * Ermittelt den CLI-Status neu und schickt ihn an den Renderer. Parallele Aufrufe teilen
 * sich denselben Durchlauf, damit der Start nicht dreimal `claude --version` spawnt.
 */
export function refreshClaudeStatus(configuredPath?: string | null): Promise<ClaudeStatus> {
  // Ein ausdrücklich mitgegebener Pfad prüft etwas anderes als der laufende Durchlauf und
  // darf sich deshalb nicht an ihn anhängen.
  if (inflight && configuredPath === undefined) return inflight

  const path = configuredPath === undefined ? getSettings().claudePath : configuredPath
  const probe = probeStatus(path)
    .then((next) => {
      cached = next
      if (next.available) log.info('Claude-CLI gefunden', { path: next.path, version: next.version })
      else log.warn('Claude-CLI nicht verfügbar', { error: next.error })
      emitEvent('claude.status', next)
      return next
    })
    .finally(() => {
      if (inflight === probe) inflight = null
    })

  if (configuredPath === undefined) inflight = probe
  return probe
}

export function getCachedClaudeStatus(): ClaudeStatus | null {
  return cached
}

/** Liefert den bekannten Status oder ermittelt ihn beim ersten Aufruf. */
export async function ensureClaudeStatus(): Promise<ClaudeStatus> {
  return cached ?? (await refreshClaudeStatus())
}

/** Pfad zur CLI für einen Lauf — oder ein klarer Fehler, wenn es sie nicht gibt. */
export async function resolveClaudeBinary(): Promise<string> {
  const current = await ensureClaudeStatus()
  if (current.available && current.path) return current.path

  // Der gemerkte Status kann veraltet sein (CLI nachinstalliert) — einmal nachfassen.
  const fresh = await refreshClaudeStatus()
  if (fresh.available && fresh.path) return fresh.path

  throw new RunError('cli_unavailable', fresh.error ?? mainT()('main.error.claudeMissing'))
}

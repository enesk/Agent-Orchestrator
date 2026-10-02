import type { Translator } from '@shared/i18n'
import { callContractMethod, type ContractOutcome } from '../ipc/dispatch'
import { isUnsupportedMethod } from './contract'

/**
 * Das Drahtprotokoll der Brücke, wie in `.v2-specs/WIRE-PROTOCOL.md` festgeschrieben. Die
 * Gegenseite liegt in einem anderen Repository; eine Abweichung hier bedeutet, dass die beiden
 * Hälften nicht zusammenpassen.
 *
 * Ohne `electron`: der Übersetzer und die Aufruffunktion kommen von außen, damit der Weg vom
 * Draht bis zum Handler im Sicherheitstest ohne App gefahren werden kann.
 */

export type WireErrorCode = 'validation' | 'unsupported' | 'internal'

export interface WireHello {
  t: 'hello'
  contractVersion: string
  appVersion: string
  language: string
}

export interface WireResult {
  t: 'result'
  id: string
  ok: boolean
  result?: unknown
  error?: { code: WireErrorCode; message: string }
}

export interface WireEvent {
  t: 'event'
  name: string
  payload: unknown
}

export type ServerMessage = WireHello | WireResult | WireEvent

export interface WireCall {
  t: 'call'
  id: string
  domain: string
  method: string
  payload?: unknown
}

export type CallFn = (domain: string, method: string, raw: unknown) => Promise<ContractOutcome>

export interface WireDeps {
  t: Translator
  /** Standardmäßig der gemeinsame Vertragsweg; der Test schiebt eine Attrappe unter. */
  call?: CallFn
}

/**
 * Was beim Lesen einer eingehenden Nachricht herauskommt: entweder eine Antwort, die zurück
 * soll, oder nichts, weil die Nachricht nicht einmal eine Kennung hatte.
 */
export type ReadResult =
  | { kind: 'call'; call: WireCall }
  | { kind: 'reject'; result: WireResult }
  | { kind: 'drop'; reason: string }

function errorResult(id: string, code: WireErrorCode, message: string): WireResult {
  return { t: 'result', id, ok: false, error: { code, message } }
}

/**
 * Liest eine Textnachricht vom Draht. Nur `call` ist vorgesehen — alles andere wird verworfen
 * statt geraten.
 */
export function readClientMessage(raw: string, t: Translator): ReadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'drop', reason: 'kein JSON' }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'drop', reason: 'kein Objekt' }
  }

  const message = parsed as Record<string, unknown>
  const id = typeof message.id === 'string' && message.id !== '' ? message.id : null

  if (message.t !== 'call') {
    // Ohne Kennung gibt es keine Antwortadresse; mit Kennung sagen wir, was fehlt.
    if (!id) return { kind: 'drop', reason: `unbekannte Art ${String(message.t)}` }
    return { kind: 'reject', result: errorResult(id, 'validation', t('main.remote.badMessage')) }
  }

  if (!id) return { kind: 'drop', reason: 'Aufruf ohne id' }

  const domain = message.domain
  const method = message.method
  if (typeof domain !== 'string' || typeof method !== 'string') {
    return { kind: 'reject', result: errorResult(id, 'validation', t('main.remote.badMessage')) }
  }

  return { kind: 'call', call: { t: 'call', id, domain, method, payload: message.payload } }
}

/**
 * Führt einen gelesenen Aufruf aus. Die fünf nativen Methoden werden **vor** dem Vertragsweg
 * abgewiesen, damit sie keinen Dialog auf dem Mac öffnen.
 */
export async function runWireCall(call: WireCall, deps: WireDeps): Promise<WireResult> {
  const { t } = deps
  const label = `${call.domain}.${call.method}`

  if (isUnsupportedMethod(call.domain, call.method)) {
    return errorResult(call.id, 'unsupported', t('main.remote.unsupported', { method: label }))
  }

  const outcome = await (deps.call ?? callContractMethod)(call.domain, call.method, call.payload)

  if (outcome.ok) return { t: 'result', id: call.id, ok: true, result: outcome.result }

  if (outcome.code === 'validation') {
    const detail = outcome.issues
      .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
      .join(', ')
    return errorResult(
      call.id,
      'validation',
      t('main.remote.invalidPayload', { method: label, detail }),
    )
  }

  return errorResult(call.id, 'internal', outcome.message)
}

/** Der ganze Weg in einem Schritt — so benutzt die WebSocket-Schicht ihn. */
export async function handleClientMessage(
  raw: string,
  deps: WireDeps,
): Promise<WireResult | { dropped: string }> {
  const read = readClientMessage(raw, deps.t)
  if (read.kind === 'drop') return { dropped: read.reason }
  if (read.kind === 'reject') return read.result
  return runWireCall(read.call, deps)
}

export function helloMessage(
  appVersion: string,
  contractVersion: string,
  language: string,
): WireHello {
  return { t: 'hello', contractVersion, appVersion, language }
}

export function eventMessage(name: string, payload: unknown): WireEvent {
  return { t: 'event', name, payload }
}

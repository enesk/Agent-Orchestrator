import { ipcChannelName, ipcContract, type IpcChannelDefinition } from '@shared/ipc-contract'

/**
 * Die transportfreie Mitte des Vertrags: hier liegen die Handler, hier wird gegen das
 * Zod-Schema geprüft, hier wird aufgerufen. `registry.ts` hängt `ipcMain.handle` davor, die
 * Fernzugriff-Brücke ihren WebSocket — beide laufen damit durch **denselben** Handler und
 * dieselbe Prüfung.
 *
 * Bewusst ohne `electron` und ohne `Logger` als Import: so lässt sich der Weg vom Request bis
 * zum Handler im Sicherheitstest ohne Electron fahren. Das Protokollieren kommt über
 * `setDispatchHooks` von außen.
 */

export interface ContractIssue {
  path: string
  message: string
}

export type ContractOutcome =
  | { ok: true; result: unknown }
  | { ok: false; code: 'validation'; message: string; issues: ContractIssue[] }
  | { ok: false; code: 'internal'; message: string; cause: unknown }

export type ContractHandler = (input: unknown) => unknown

export interface DispatchHooks {
  onInvalid: (channel: string, issues: readonly ContractIssue[]) => void
  onFailed: (channel: string, error: unknown) => void
}

const handlers = new Map<string, ContractHandler>()

let hooks: DispatchHooks | null = null

/** Einmalig beim Registrieren gesetzt; der Test lässt sie weg oder schiebt eigene unter. */
export function setDispatchHooks(next: DispatchHooks | null): void {
  hooks = next
}

export function contractDefinition(domain: string, method: string): IpcChannelDefinition | null {
  const domainContract = (ipcContract as unknown as Record<string, Record<string, IpcChannelDefinition>>)[
    domain
  ]
  if (!domainContract) return null
  return Object.hasOwn(domainContract, method) ? domainContract[method]! : null
}

export function setContractHandler(domain: string, method: string, handler: ContractHandler): void {
  handlers.set(ipcChannelName(domain, method), handler)
}

export function hasContractHandler(domain: string, method: string): boolean {
  return handlers.has(ipcChannelName(domain, method))
}

/** Nur für Tests: den Tisch zwischen zwei Fällen leer machen. */
export function clearContractHandlers(): void {
  handlers.clear()
}

/**
 * Prüft `raw` gegen das Vertragsschema und ruft erst dann den Handler. Ein ungültiger Request
 * erreicht den Handler nie — unabhängig davon, über welchen Transport er kam.
 */
export async function callContractMethod(
  domain: string,
  method: string,
  raw: unknown,
): Promise<ContractOutcome> {
  const channel = ipcChannelName(domain, method)
  const definition = contractDefinition(domain, method)
  const handler = handlers.get(channel)

  if (!definition || !handler) {
    return { ok: false, code: 'internal', message: `Kein Handler für ${channel}`, cause: null }
  }

  const parsed = definition.request.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    hooks?.onInvalid(channel, issues)
    return { ok: false, code: 'validation', message: `Ungültige Anfrage an ${channel}`, issues }
  }

  try {
    return { ok: true, result: await handler(parsed.data) }
  } catch (error) {
    hooks?.onFailed(channel, error)
    return {
      ok: false,
      code: 'internal',
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    }
  }
}

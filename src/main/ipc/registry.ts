import { ipcMain } from 'electron'
import {
  ipcChannelName,
  ipcContract,
  type IpcChannelDefinition,
  type IpcDomain,
  type IpcMethod,
  type IpcParsedRequest,
  type IpcResponse,
} from '@shared/ipc-contract'
import { describeError, logger } from '../Logger'

export type DomainHandlers<D extends IpcDomain> = {
  [M in IpcMethod<D>]: (
    input: IpcParsedRequest<D, M>,
  ) => IpcResponse<D, M> | Promise<IpcResponse<D, M>>
}

function methodsOf(domain: IpcDomain): string[] {
  return Object.keys(ipcContract[domain])
}

function definitionOf(domain: IpcDomain, method: string): IpcChannelDefinition {
  return (ipcContract[domain] as unknown as Record<string, IpcChannelDefinition>)[method]!
}

/**
 * Registriert alle Kanäle einer Domäne. Der Request wird gegen den Vertrag geprüft, bevor der
 * Handler ihn sieht — der Renderer kann also nichts durchreichen, was das Schema nicht kennt.
 */
export function registerDomain<D extends IpcDomain>(domain: D, handlers: DomainHandlers<D>): void {
  for (const method of methodsOf(domain)) {
    const definition = definitionOf(domain, method)
    const channel = ipcChannelName(domain, method)
    const handler = (handlers as Record<string, (input: unknown) => unknown>)[method]

    if (!handler) throw new Error(`Kein Handler für ${channel}`)

    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const parsed = definition.request.safeParse(raw)
      if (!parsed.success) {
        logger.warn('ipc', `Ungültiger Request für ${channel}`, {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        })
        throw new Error(`Ungültige Anfrage an ${channel}`)
      }

      try {
        return await handler(parsed.data)
      } catch (error) {
        logger.error('ipc', `${channel} ist fehlgeschlagen`, describeError(error))
        throw error
      }
    })
  }
}

/**
 * Platzhalter für Domänen, die ein späterer Worker füllt. Der Fehler ist bewusst deutlich,
 * damit im Renderer sofort sichtbar ist, was noch fehlt.
 */
export function createStubHandlers<D extends IpcDomain>(domain: D): DomainHandlers<D> {
  const handlers: Record<string, () => never> = {}
  for (const method of methodsOf(domain)) {
    handlers[method] = () => {
      throw new Error(`${domain}.${method} ist noch nicht implementiert`)
    }
  }
  return handlers as DomainHandlers<D>
}

/** Wie `createStubHandlers`, aber einzelne Methoden sind bereits umgesetzt. */
export function withStubs<D extends IpcDomain>(
  domain: D,
  implemented: Partial<DomainHandlers<D>>,
): DomainHandlers<D> {
  return { ...createStubHandlers(domain), ...implemented }
}

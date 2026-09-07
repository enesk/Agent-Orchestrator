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

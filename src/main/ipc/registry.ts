import { ipcMain } from 'electron'
import {
  ipcChannelName,
  ipcContract,
  type IpcDomain,
  type IpcMethod,
  type IpcParsedRequest,
  type IpcResponse,
} from '@shared/ipc-contract'
import { describeError, logger } from '../Logger'
import {
  callContractMethod,
  setContractHandler,
  setDispatchHooks,
  type ContractHandler,
} from './dispatch'

export type DomainHandlers<D extends IpcDomain> = {
  [M in IpcMethod<D>]: (
    input: IpcParsedRequest<D, M>,
  ) => IpcResponse<D, M> | Promise<IpcResponse<D, M>>
}

function methodsOf(domain: IpcDomain): string[] {
  return Object.keys(ipcContract[domain])
}

setDispatchHooks({
  onInvalid: (channel, issues) => {
    logger.warn('ipc', `Ungültiger Request für ${channel}`, { issues: [...issues] })
  },
  onFailed: (channel, error) => {
    logger.error('ipc', `${channel} ist fehlgeschlagen`, describeError(error))
  },
})

/**
 * Registriert alle Kanäle einer Domäne. Der Request wird gegen den Vertrag geprüft, bevor der
 * Handler ihn sieht — der Renderer kann also nichts durchreichen, was das Schema nicht kennt.
 *
 * Geprüft und aufgerufen wird in `dispatch.ts`; `ipcMain` ist nur noch der Transport davor.
 * Die Fernzugriff-Brücke benutzt dieselbe Mitte, ohne diesen Weg zu verändern.
 */
export function registerDomain<D extends IpcDomain>(domain: D, handlers: DomainHandlers<D>): void {
  for (const method of methodsOf(domain)) {
    const channel = ipcChannelName(domain, method)
    const handler = (handlers as Record<string, ContractHandler | undefined>)[method]

    if (!handler) throw new Error(`Kein Handler für ${channel}`)

    setContractHandler(domain, method, handler)

    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const outcome = await callContractMethod(domain, method, raw)
      if (outcome.ok) return outcome.result
      // Der Renderer sieht denselben Fehler wie bisher: die Zod-Ablehnung als eigene Meldung,
      // ein geplatzter Handler mit seinem ursprünglichen Fehler.
      if (outcome.code === 'internal' && outcome.cause !== null) throw outcome.cause
      throw new Error(outcome.message)
    })
  }
}

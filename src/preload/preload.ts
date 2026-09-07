import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC_EVENT_CHANNEL,
  ipcChannelName,
  ipcContract,
  type IpcApi,
  type IpcEventName,
} from '@shared/ipc-contract'

interface EventEnvelope {
  event: IpcEventName
  payload: unknown
}

/** `window.api` entsteht direkt aus dem Vertrag — es gibt keine handgepflegte Kanalliste. */
function buildApi(): IpcApi {
  const api: Record<string, unknown> = {}

  for (const domain of Object.keys(ipcContract)) {
    const methods: Record<string, (input?: unknown) => Promise<unknown>> = {}
    const domainContract = ipcContract[domain as keyof typeof ipcContract]
    for (const method of Object.keys(domainContract)) {
      const channel = ipcChannelName(domain, method)
      methods[method] = (input?: unknown) => ipcRenderer.invoke(channel, input)
    }
    api[domain] = methods
  }

  api.on = (event: IpcEventName, listener: (payload: unknown) => void): (() => void) => {
    const forward = (_event: IpcRendererEvent, envelope: EventEnvelope): void => {
      if (envelope?.event === event) listener(envelope.payload)
    }
    ipcRenderer.on(IPC_EVENT_CHANNEL, forward)
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNEL, forward)
    }
  }

  return api as unknown as IpcApi
}

contextBridge.exposeInMainWorld('api', buildApi())

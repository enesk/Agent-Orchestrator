import { BrowserWindow } from 'electron'
import { IPC_EVENT_CHANNEL, type IpcEventName, type IpcEventPayload } from '@shared/ipc-contract'

/** Schickt ein Event an alle offenen Fenster. Fehlende Fenster sind kein Fehler. */
export function emitEvent<E extends IpcEventName>(event: E, payload: IpcEventPayload<E>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(IPC_EVENT_CHANNEL, { event, payload })
  }
}

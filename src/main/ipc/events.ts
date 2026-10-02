import { BrowserWindow } from 'electron'
import { IPC_EVENT_CHANNEL, type IpcEventName, type IpcEventPayload } from '@shared/ipc-contract'

export type EventObserver = (event: IpcEventName, payload: unknown) => void

const observers = new Set<EventObserver>()

/**
 * Hängt einen zweiten Zuhörer an die Ereignisse — heute die Fernzugriff-Brücke. Der Renderer
 * merkt davon nichts: er bekommt sein Ereignis zuerst, und ein Fehler im Zuhörer bleibt hier.
 */
export function observeEvents(observer: EventObserver): () => void {
  observers.add(observer)
  return () => observers.delete(observer)
}

/** Schickt ein Event an alle offenen Fenster. Fehlende Fenster sind kein Fehler. */
export function emitEvent<E extends IpcEventName>(event: E, payload: IpcEventPayload<E>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(IPC_EVENT_CHANNEL, { event, payload })
  }

  for (const observer of observers) {
    try {
      observer(event, payload)
    } catch {
      // Ein stolpernder Zuhörer darf den Lauf nicht anhalten. Protokollieren geht hier nicht:
      // der Logger ruft `emitEvent` selbst auf.
    }
  }
}

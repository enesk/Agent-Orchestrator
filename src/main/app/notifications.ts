import { Notification } from 'electron'
import { getSettings } from './settings'
import { createMainWindow } from './window'

export interface NotifyOptions {
  title: string
  body: string
  /** Beim Klick das Fenster nach vorne holen. */
  focusOnClick?: boolean
}

export function notify(options: NotifyOptions): void {
  if (!getSettings().notificationsEnabled) return
  if (!Notification.isSupported()) return

  const notification = new Notification({ title: options.title, body: options.body })
  if (options.focusOnClick !== false) {
    notification.on('click', () => {
      createMainWindow().focus()
    })
  }
  notification.show()
}

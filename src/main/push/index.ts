import { getSettings } from '../app/settings'
import { attach, detach } from './Notifier'
import * as service from './PushService'

/**
 * Das Modul `push` nach außen. Additiv wie die Brücke: ein Aufruf im Bootstrap, einer nach
 * dem Speichern der Einstellungen — sonst greift nichts in Bestehendes.
 */

/**
 * Bringt Versender und Zuhörer mit den Einstellungen in Übereinstimmung. Wird beim Start der
 * App und nach jedem Speichern gerufen; an und aus wirkt damit sofort, ohne Neustart.
 *
 * Ausgeschaltet hängt **kein** Zuhörer am Ereignisstrom: dann wird nicht nur nichts
 * geschickt, es wird auch nichts gebaut.
 */
export async function applySettings(): Promise<void> {
  if (getSettings().pushEnabled) {
    await service.applySettings()
    attach()
    return
  }

  detach()
  await service.applySettings()
}

export async function stop(): Promise<void> {
  detach()
  await service.close()
}

export {
  clearCredentials,
  getStatus,
  listDevices,
  register,
  setCredentials,
  setKeyFile,
  snapshot,
  unregister,
} from './PushService'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { dialog } from 'electron'
import { mainT } from '../app/settings'
import { getMainWindow } from '../app/window'
import * as push from '../push'
import type { DomainHandlers } from './registry'

/**
 * `register` und `unregister` müssen vom iPhone kommen — sie sind über die Brücke erreichbar.
 * `setCredentials`, `clearCredentials` und `pickKeyFile` stehen in der `unsupported`-Liste:
 * der `.p8`-Schlüssel gehört an den Rechner, auf dem der Schlüsselbund liegt, und die Brücke
 * ist ohne Zugangsschutz erreichbar.
 *
 * Heraus kommt der Schlüssel **nie** — nur `pushStatus`, und dort steht bloß, ob etwas
 * hinterlegt ist.
 */
export const pushHandlers: DomainHandlers<'push'> = {
  register: ({ deviceToken, bundleId, environment, activityToken }) =>
    push.register({ deviceToken, bundleId, environment, activityToken }),

  unregister: ({ deviceToken }) => {
    push.unregister(deviceToken)
    return { ok: true }
  },

  status: () => push.getStatus(),

  devices: () => push.listDevices(),

  setCredentials: ({ keyId, teamId }) => push.setCredentials(keyId, teamId),

  clearCredentials: () => push.clearCredentials(),

  /**
   * Der Dateidialog liest den Schlüssel **hier** und legt ihn gleich verschlüsselt ab. Der
   * Inhalt geht damit nie durch den Renderer — zurück kommt nur der Status samt Dateiname.
   */
  pickKeyFile: async () => {
    const window = getMainWindow()
    const t = mainT()
    const options: Electron.OpenDialogOptions = {
      title: t('main.push.pickKeyTitle'),
      buttonLabel: t('main.push.pickKeyButton'),
      filters: [{ name: t('main.push.keyFilter'), extensions: ['p8'] }],
      properties: ['openFile', 'dontAddToRecent'],
    }

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return push.getStatus()

    const file = result.filePaths[0]!
    return push.setKeyFile(await readFile(file, 'utf8'), path.basename(file))
  },
}

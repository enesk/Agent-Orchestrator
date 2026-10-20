import { dialog } from 'electron'
import { getSettings, mainT, saveSettings } from '../app/settings'
import { refreshTray } from '../app/tray'
import { getMainWindow } from '../app/window'
import { refreshClaudeStatus } from '../claude'
import { applySettings as applyPushSettings } from '../push'
import { applySettings as applyRemoteSettings } from '../remote'
import type { DomainHandlers } from './registry'

export const settingsHandlers: DomainHandlers<'settings'> = {
  get: () => getSettings(),
  save: (patch) => {
    const previous = getSettings()
    const settings = saveSettings(patch)
    // Ein neuer CLI-Pfad macht den gemerkten Status ungültig; das Ergebnis kommt als Event.
    if (settings.claudePath !== previous.claudePath) void refreshClaudeStatus().finally(refreshTray)
    else refreshTray()

    // An und aus wirkt sofort, ohne Neustart. Das Ergebnis kommt als `remote.changed`.
    if (
      settings.remoteEnabled !== previous.remoteEnabled ||
      settings.remotePort !== previous.remotePort ||
      settings.webuiPath !== previous.webuiPath
    ) {
      void applyRemoteSettings()
    }

    // An und aus wirkt sofort. Die Anlässe brauchen keinen Anstoß — der Zuhörer liest sie bei
    // jedem Ereignis frisch aus den Einstellungen.
    if (
      settings.pushEnabled !== previous.pushEnabled ||
      settings.pushEnvironment !== previous.pushEnvironment
    ) {
      void applyPushSettings()
    }

    return settings
  },
  pickClaudePath: async () => {
    const window = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: mainT()('main.dialog.pickClaudeTitle'),
      buttonLabel: mainT()('main.dialog.pickClaudeButton'),
      defaultPath: getSettings().claudePath ?? '/usr/local/bin',
      properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'],
    }

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0]! }
  },
}

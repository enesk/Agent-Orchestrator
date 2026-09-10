import { dialog } from 'electron'
import { getSettings, mainT, saveSettings } from '../app/settings'
import { refreshTray } from '../app/tray'
import { getMainWindow } from '../app/window'
import { refreshClaudeStatus } from '../claude'
import type { DomainHandlers } from './registry'

export const settingsHandlers: DomainHandlers<'settings'> = {
  get: () => getSettings(),
  save: (patch) => {
    const before = getSettings().claudePath
    const settings = saveSettings(patch)
    // Ein neuer CLI-Pfad macht den gemerkten Status ungültig; das Ergebnis kommt als Event.
    if (settings.claudePath !== before) void refreshClaudeStatus().finally(refreshTray)
    else refreshTray()
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

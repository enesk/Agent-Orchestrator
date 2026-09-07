import { dialog } from 'electron'
import { getSettings, saveSettings } from '../app/settings'
import { refreshTray } from '../app/tray'
import { getMainWindow } from '../app/window'
import type { DomainHandlers } from './registry'

export const settingsHandlers: DomainHandlers<'settings'> = {
  get: () => getSettings(),
  save: (patch) => {
    const settings = saveSettings(patch)
    refreshTray()
    return settings
  },
  pickClaudePath: async () => {
    const window = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Claude-CLI auswählen',
      buttonLabel: 'Auswählen',
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

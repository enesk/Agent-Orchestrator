import { dirname } from 'node:path'
import { app, shell } from 'electron'
import { APP_NAME } from '@shared/constants'
import { getDatabasePath } from '../db/connection'
import type { DomainHandlers } from './registry'

export const appHandlers: DomainHandlers<'app'> = {
  info: () => {
    const databasePath = getDatabasePath()
    return {
      name: APP_NAME,
      version: app.getVersion(),
      electronVersion: process.versions.electron ?? '',
      platform: process.platform,
      databasePath,
      databaseDirectory: dirname(databasePath),
    }
  },
  openDatabaseFolder: async () => {
    await shell.openPath(dirname(getDatabasePath()))
    return { ok: true }
  },
  showDatabaseFile: () => {
    shell.showItemInFolder(getDatabasePath())
    return { ok: true }
  },
}

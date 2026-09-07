import { BrowserWindow, app } from 'electron'
import { APP_NAME } from '@shared/constants'
import { closeDatabase, initDatabase } from '../db/connection'
import { markStaleStreamingMessages } from '../db/repositories/messages'
import { registerIpcHandlers } from '../ipc'
import { releaseAll, start as startMcpServer, stop as stopMcpServer } from '../mcp'
import { describeError, logger } from '../Logger'
import { registerAttachmentProtocol, registerAttachmentSchemePrivileges } from './attachments'
import { getSettings } from './settings'
import { createTray, destroyTray } from './tray'
import { createMainWindow, getMainWindow, isQuitting, setQuitting } from './window'

// Muss vor `whenReady` passieren, sonst kennt Electron das Schema nicht.
registerAttachmentSchemePrivileges()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    } else {
      createMainWindow()
    }
  })

  void bootstrap()
}

async function bootstrap(): Promise<void> {
  app.setName(APP_NAME)

  await app.whenReady()

  try {
    initDatabase()
    const stale = markStaleStreamingMessages()
    if (stale > 0) {
      logger.warn('app', `${stale} unterbrochene Nachrichten aufgeräumt`)
    }
  } catch (error) {
    logger.error('app', 'Datenbank konnte nicht geöffnet werden', describeError(error))
    throw error
  }

  registerAttachmentProtocol()
  registerIpcHandlers()

  try {
    await startMcpServer()
  } catch (error) {
    // Ohne Werkzeugserver läuft die App weiter, die Agenten arbeiten dann aber blind.
    logger.error('app', 'Werkzeugserver konnte nicht gestartet werden', describeError(error))
  }

  createTray()
  createMainWindow()

  logger.info('app', `${APP_NAME} gestartet`)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else getMainWindow()?.show()
  })
}

app.on('before-quit', () => {
  setQuitting(true)
  releaseAll()
  void stopMcpServer()
})

app.on('window-all-closed', () => {
  // Auf macOS bleibt die App üblicherweise im Dock; sonst nur, wenn der Tray gewünscht ist.
  if (isQuitting()) return
  if (process.platform !== 'darwin' && !getSettings().minimizeToTray) app.quit()
})

app.on('quit', () => {
  destroyTray()
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  logger.error('app', 'Unbehandelter Fehler im Main-Prozess', describeError(error))
})

process.on('unhandledRejection', (reason) => {
  logger.error('app', 'Unbehandelte Promise-Ablehnung', describeError(reason))
})

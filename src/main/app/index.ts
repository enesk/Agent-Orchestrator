import { BrowserWindow, app, dialog } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '@shared/constants'
import { SchemaMismatchError, closeDatabase, initDatabase } from '../db/connection'
import { markStaleStreamingMessages } from '../db/repositories/messages'
import { initChatEngine } from '../chat'
import { resumeInterrupted, shutdown as shutdownGoals } from '../goals'
import { getCachedClaudeStatus, listRuns, refreshClaudeStatus } from '../claude'
import { registerIpcHandlers } from '../ipc'
import { releaseAll, start as startMcpServer, stop as stopMcpServer } from '../mcp'
import { applySettings as applyPushSettings, stop as stopPush } from '../push'
import { applySettings as applyRemoteSettings, stop as stopRemote } from '../remote'
import { describeError, logger } from '../Logger'
import { registerAttachmentProtocol, registerAttachmentSchemePrivileges } from './attachments'
import { getSettings } from './settings'
import { createTray, destroyTray, refreshTray, setTrayStatusSources } from './tray'
import { createMainWindow, getMainWindow, isQuitting, setQuitting } from './window'
import { mainT } from './settings'

// Eigener Datenordner: v1 heißt ebenfalls `orchestrator-agent` und legt dort eine
// `orchestrator.db` in einem völlig anderen Schema ab. Muss vor jedem `app.getPath('userData')`
// stehen, also noch vor `whenReady`.
app.setPath('userData', join(app.getPath('appData'), 'Orchestrator Agent v2'))

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
    // Ein stiller Schemabruch ist der schlechteste Ausgang: lieber sichtbar abbrechen.
    dialog.showErrorBox(
      error instanceof SchemaMismatchError
        ? mainT()('main.dialog.schemaMismatch')
        : mainT()('main.dialog.databaseUnreadable'),
      error instanceof Error ? error.message : String(error),
    )
    app.exit(1)
    return
  }

  registerAttachmentProtocol()
  initChatEngine()
  registerIpcHandlers()

  try {
    await startMcpServer()
  } catch (error) {
    // Ohne Werkzeugserver läuft die App weiter, die Agenten arbeiten dann aber blind.
    logger.error('app', 'Werkzeugserver konnte nicht gestartet werden', describeError(error))
  }

  // Der Tray zeigt Claude-Status und laufende Agenten an; beide leben in anderen Modulen.
  setTrayStatusSources({
    claudeStatus: getCachedClaudeStatus,
    activeRunCount: () => listRuns().length,
  })
  createTray()
  createMainWindow()

  // Die CLI-Erkennung läuft von sich aus los, damit Status-Chip und Tray nicht erst dann
  // etwas wissen, wenn der Renderer danach fragt.
  void refreshClaudeStatus().finally(refreshTray)

  logger.info('app', `${APP_NAME} gestartet`)

  // Erst nach dem Fenster, damit die Oberfläche die ersten Ereignisse mitbekommt.
  resumeInterrupted()

  // Die Fernzugriff-Brücke startet nur, wenn sie in den Einstellungen eingeschaltet ist.
  void applyRemoteSettings()

  // Dasselbe für den APNs-Versand: ausgeschaltet hängt kein Zuhörer am Ereignisstrom.
  void applyPushSettings()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else getMainWindow()?.show()
  })
}

app.on('before-quit', () => {
  setQuitting(true)
  shutdownGoals()
  releaseAll()
  void stopMcpServer()
  void stopRemote()
  void stopPush()
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

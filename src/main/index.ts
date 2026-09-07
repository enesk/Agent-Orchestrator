import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import url from 'url'
import { orchestrator } from './Orchestrator'
import { TrayManager } from './TrayManager'
import { getSettings } from './StoreManager'
import { log } from './Logger'
import { WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT } from '@shared/constants'

protocol.registerSchemesAsPrivileged([
  { scheme: 'attachment', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: 'Orchestrator Agent',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Show window when ready to avoid flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (e) => {
    const settings = getSettings()
    if (settings.minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  orchestrator.setMainWindow(mainWindow)
  trayManager.init(mainWindow)

  // Update tray when state changes
  orchestrator.on('state-update', () => {
    const state = orchestrator.getState()
    trayManager.updateStatus(state.connected)
  })
}

app.whenReady().then(async () => {
  log('info', 'Orchestrator Agent starting...')

  // Serve user-data attachment files via attachment:// scheme
  const attachmentsRoot = path.join(app.getPath('userData'), 'attachments')
  protocol.handle('attachment', (req) => {
    const requested = req.url.replace(/^attachment:\/\//, '')
    const decoded = decodeURIComponent(requested)
    const resolved = path.normalize(path.join(attachmentsRoot, decoded))
    if (!resolved.startsWith(attachmentsRoot)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(url.pathToFileURL(resolved).toString())
  })

  trayManager = new TrayManager(orchestrator)

  await orchestrator.initialize()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    orchestrator.destroy()
    app.quit()
  }
})

app.on('before-quit', () => {
  orchestrator.destroy()
  trayManager.destroy()
})

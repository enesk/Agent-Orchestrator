import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import path from 'path'
import { Orchestrator } from './Orchestrator'

export class TrayManager {
  private tray: Tray | null = null
  private orchestrator: Orchestrator
  private mainWindow: BrowserWindow | null = null

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator
  }

  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow

    const iconPath = path.join(__dirname, '../../assets/tray-disconnected.png')
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    this.tray = new Tray(icon)

    this.tray.setToolTip('Orchestrator Agent – Getrennt')
    this.updateContextMenu()

    this.tray.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    })
  }

  updateStatus(connected: boolean): void {
    if (!this.tray) return

    // Update icon
    const iconName = connected ? 'tray-connected.png' : 'tray-disconnected.png'
    const iconPath = path.join(__dirname, '../../assets', iconName)
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    this.tray.setImage(icon)

    // Update tooltip
    this.tray.setToolTip(
      connected ? 'Orchestrator Agent – Verbunden' : 'Orchestrator Agent – Getrennt'
    )

    // Update context menu
    this.updateContextMenu()
  }

  private updateContextMenu(): void {
    const state = this.orchestrator.getState()

    const menu = Menu.buildFromTemplate([
      {
        label: 'Dashboard \u00f6ffnen',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show()
            this.mainWindow.focus()
          }
        },
      },
      { type: 'separator' },
      {
        label: `Status: ${state.connected ? 'Verbunden' : 'Getrennt'}`,
        enabled: false,
      },
      {
        label: `Sessions: ${state.activeSessions}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Beenden',
        click: () => {
          this.orchestrator.destroy()
          app.quit()
        },
      },
    ])

    this.tray?.setContextMenu(menu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

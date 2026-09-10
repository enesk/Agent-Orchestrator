import { Menu, Tray, app, nativeImage } from 'electron'
import { APP_NAME } from '@shared/constants'
import type { ClaudeStatus } from '@shared/types'
import { assetPath } from './paths'
import { createMainWindow } from './window'
import { mainT } from './settings'

/**
 * Der Tray zeigt Dinge an, die woanders entstehen: den Claude-Status und die Zahl der
 * laufenden Agenten-Runs. Statt diese Module hier zu importieren (und damit eine Abhängigkeit
 * vom Tray auf die Claude-Schicht zu erzeugen), meldet sich die Gegenseite über
 * `setTrayStatusSources` an. Solange sich niemand anmeldet, gelten die Vorgaben unten.
 */
export interface TrayStatusSources {
  claudeStatus: () => ClaudeStatus | null
  activeRunCount: () => number
}

const sources: TrayStatusSources = {
  claudeStatus: () => null,
  activeRunCount: () => 0,
}

let tray: Tray | null = null

export function setTrayStatusSources(patch: Partial<TrayStatusSources>): void {
  Object.assign(sources, patch)
  refreshTray()
}

export function createTray(): Tray {
  if (tray) return tray

  tray = new Tray(trayImage(false))
  tray.setToolTip(APP_NAME)

  // Kein `setContextMenu`: auf macOS würde damit auch der Linksklick das Menü öffnen. So bringt
  // der Klick das Fenster nach vorn, und das Menü wird beim Öffnen frisch gebaut.
  tray.on('click', () => {
    createMainWindow()
  })
  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildMenu())
  })

  // Linux kennt kein `right-click`-Event; dort muss das Menü fest hinterlegt sein.
  if (process.platform === 'linux') tray.setContextMenu(buildMenu())

  refreshTray()
  return tray
}

/** Icon und Tooltip an den aktuellen Status angleichen. Von außen nach Statuswechseln aufrufen. */
export function refreshTray(): void {
  if (!tray) return

  const status = sources.claudeStatus()
  const available = status?.available === true
  tray.setImage(trayImage(available))
  const t = mainT()
  tray.setToolTip(
    available
      ? t('main.tray.tooltipReady', { app: APP_NAME })
      : t('main.tray.tooltipMissing', { app: APP_NAME }),
  )
  if (process.platform === 'linux') tray.setContextMenu(buildMenu())
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

function buildMenu(): Menu {
  const t = mainT()
  const status = sources.claudeStatus()
  const runs = sources.activeRunCount()

  return Menu.buildFromTemplate([
    { label: t('main.tray.open'), click: () => createMainWindow() },
    { type: 'separator' },
    { label: claudeLabel(status), enabled: false },
    {
      label: t('main.tray.running', { count: runs }),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: t('main.tray.quit'),
      click: () => {
        app.quit()
      },
    },
  ])
}

function claudeLabel(status: ClaudeStatus | null): string {
  const t = mainT()
  if (!status) return t('main.tray.claudeUnchecked')
  if (!status.available) return t('main.tray.claudeMissing')
  return status.version
    ? t('main.tray.claudeVersion', { version: status.version })
    : t('main.tray.claudeReady')
}

/**
 * Das Template-Icon färbt macOS selbst ein; für den Fehlerfall gibt es eine eigene Datei.
 * Fehlt sie im Paket, bleibt das Standard-Icon stehen statt eines leeren Trays.
 */
function trayImage(available: boolean): Electron.NativeImage {
  const file = available ? 'trayTemplate.png' : 'tray-offlineTemplate.png'
  let image = nativeImage.createFromPath(assetPath(file))
  if (image.isEmpty()) image = nativeImage.createFromPath(assetPath('trayTemplate.png'))
  image.setTemplateImage(true)
  return image
}

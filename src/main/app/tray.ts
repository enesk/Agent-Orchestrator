import { Menu, Tray, app, nativeImage } from 'electron'
import { APP_NAME } from '@shared/constants'
import { assetPath } from './paths'
import { createMainWindow, getMainWindow } from './window'

let tray: Tray | null = null

export function createTray(): Tray {
  if (tray) return tray

  const image = nativeImage.createFromPath(assetPath('trayTemplate.png'))
  image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Fenster öffnen', click: () => createMainWindow() },
      { type: 'separator' },
      {
        label: 'Beenden',
        click: () => {
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => {
    const window = getMainWindow()
    if (window?.isVisible()) window.hide()
    else createMainWindow()
  })

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

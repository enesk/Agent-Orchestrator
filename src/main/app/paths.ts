import path from 'node:path'
import { app } from 'electron'

/** Statische Bilder liegen im Paket unter `resources/assets`, im Dev-Modus im Repo. */
export function assetPath(...segments: string[]): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets')
  return path.join(root, ...segments)
}

import Store from 'electron-store'
import type { AppSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  claudePath: null,
  minimizeToTray: true,
  notificationsEnabled: true,
}

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULTS,
})

export function getSettings(): AppSettings {
  return {
    claudePath: store.get('claudePath') ?? null,
    minimizeToTray: store.get('minimizeToTray') ?? DEFAULTS.minimizeToTray,
    notificationsEnabled: store.get('notificationsEnabled') ?? DEFAULTS.notificationsEnabled,
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    store.set(key as keyof AppSettings, value as never)
  }
  return getSettings()
}

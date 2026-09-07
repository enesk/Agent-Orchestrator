import Store from 'electron-store'
import { StoredSettings } from '@shared/types'
import { DEFAULT_BACKEND_URL, DEFAULT_CLAUDE_PATH } from '@shared/constants'

const defaults: StoredSettings = {
  backendUrl: DEFAULT_BACKEND_URL,
  userToken: '',
  autoStart: false,
  minimizeToTray: true,
  claudePath: DEFAULT_CLAUDE_PATH,
}

const store = new Store<StoredSettings>({ defaults })

export function getSettings(): StoredSettings {
  return {
    backendUrl: store.get('backendUrl'),
    userToken: store.get('userToken'),
    autoStart: store.get('autoStart'),
    minimizeToTray: store.get('minimizeToTray'),
    claudePath: store.get('claudePath'),
  }
}

export function saveSettings(settings: Partial<StoredSettings>): void {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key as keyof StoredSettings, value)
  }
}

export function getToken(): string {
  return store.get('userToken')
}

export function getBackendUrl(): string {
  return store.get('backendUrl')
}

export default store

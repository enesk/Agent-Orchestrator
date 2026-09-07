import { getSettings, saveSettings } from '../app/settings'
import type { DomainHandlers } from './registry'

export const settingsHandlers: DomainHandlers<'settings'> = {
  get: () => getSettings(),
  save: (patch) => saveSettings(patch),
}

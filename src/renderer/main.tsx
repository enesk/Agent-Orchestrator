import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n'
import { useSettingsStore } from './store/settingsStore'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing')

// Die Einstellungen liegen vor dem ersten Rendern vor, sonst blitzt die Voreinstellung
// Deutsch auf, bevor die gewählte Sprache greift.
void useSettingsStore
  .getState()
  .load()
  .finally(() => {
    createRoot(container).render(
      <StrictMode>
        <I18nProvider>
          <App />
        </I18nProvider>
      </StrictMode>,
    )
  })

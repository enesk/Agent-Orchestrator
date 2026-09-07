import { EmptyState } from '../../ui'
import { SettingsIcon } from '../../ui/icons'

/** Platzhalter — wird von einem späteren Ticket gefüllt. */
export function SettingsView() {
  return <EmptyState title="Einstellungen" description="Hier entstehen die Einstellungen für Claude-Pfad, Tray und Hinweise." icon={<SettingsIcon />} />
}

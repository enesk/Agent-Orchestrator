import { useActiveProject } from '../store/projectStore'
import { SECTION_LABELS, useUiStore } from '../store/uiStore'
import { IconButton } from '../ui'
import { PanelIcon } from '../ui/icons'
import { ClaudeStatusChip } from './ClaudeStatusChip'

export function TopBar() {
  const project = useActiveProject()
  const activeSection = useUiStore((state) => state.activeSection)
  const panelOpen = useUiStore((state) => state.panelOpen)
  const togglePanel = useUiStore((state) => state.togglePanel)

  return (
    <header className="drag-region flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-ink">
          {project?.name ?? 'Kein Projekt ausgewählt'}
        </span>
        <span className="ml-2 text-xs text-ink-faint">{SECTION_LABELS[activeSection]}</span>
      </div>

      <div className="no-drag flex items-center gap-2">
        <ClaudeStatusChip />
        <IconButton
          label={panelOpen ? 'Seitenpanel schließen' : 'Seitenpanel öffnen'}
          icon={<PanelIcon />}
          active={panelOpen}
          onClick={togglePanel}
        />
      </div>
    </header>
  )
}

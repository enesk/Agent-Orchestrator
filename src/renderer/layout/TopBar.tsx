import { useT } from '../i18n'
import { useActiveProject } from '../store/projectStore'
import { SECTION_LABEL_KEYS, useUiStore } from '../store/uiStore'
import { IconButton } from '../ui'
import { TerminalIcon } from '../ui/icons'
import { ClaudeStatusChip } from './ClaudeStatusChip'

export function TopBar() {
  const t = useT()
  const project = useActiveProject()
  const activeSection = useUiStore((state) => state.activeSection)
  const logBarOpen = useUiStore((state) => state.logBarOpen)
  const toggleLogBar = useUiStore((state) => state.toggleLogBar)

  return (
    <header className="drag-region flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-ink">
          {project?.name ?? t('topBar.noProject')}
        </span>
        <span className="ml-2 text-xs text-ink-faint">{t(SECTION_LABEL_KEYS[activeSection])}</span>
      </div>

      <div className="no-drag flex items-center gap-2">
        <ClaudeStatusChip />
        <IconButton
          label={logBarOpen ? t('topBar.closeLog') : t('topBar.openLog')}
          icon={<TerminalIcon />}
          active={logBarOpen}
          onClick={toggleLogBar}
        />
      </div>
    </header>
  )
}

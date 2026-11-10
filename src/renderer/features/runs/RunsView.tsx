import { useEffect, useState } from 'react'
import type { ActiveRun } from '@shared/types'
import { useT } from '../../i18n'
import { useRunStore } from '../../store/runStore'
import { useUiStore } from '../../store/uiStore'
import { EmptyState, cn } from '../../ui'
import { PulseIcon } from '../../ui/icons'
import { RunList } from './RunList'

/**
 * Die Laufzeit ist das einzige, was sich ohne Ereignis ändert — eine Uhr muss also ticken.
 * Eine für die ganze Ansicht, und nur solange überhaupt etwas läuft.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export function RunsView() {
  const t = useT()
  const runs = useRunStore((state) => state.runs)
  const error = useRunStore((state) => state.error)
  const setActiveProject = useUiStore((state) => state.setActiveProject)
  const setActiveSection = useUiStore((state) => state.setActiveSection)
  const now = useNow(runs.length > 0)

  if (error) {
    return <EmptyState title={t('runs.loadFailed')} description={error} icon={<PulseIcon />} />
  }

  /**
   * Von der Zeile dorthin, wo der Lauf passiert: ins Vorhaben, sonst in den Chat. Wartet er
   * auf eine Antwort, führt die Zeile zu den Rückfragen — dort steht, was ihn weiterbringt.
   */
  function open(run: ActiveRun): void {
    setActiveProject(run.projectId)
    if (run.waitingQuestionId !== null) {
      setActiveSection('questions')
      return
    }
    setActiveSection(run.goalId === null ? 'chat' : 'goals')
  }

  return (
    <div className="min-h-full bg-ui-bg font-sans text-[13px] leading-[1.4] text-ui-text">
      <header
        className={cn(
          'sticky top-0 z-[5] flex items-center gap-2.5 px-3.5 py-[10px] wide:px-5',
          'border-b border-ui-line bg-ui-panel',
        )}
      >
        <h1 className="text-[14px] font-semibold">{t('runs.title')}</h1>
        <span className="tabular-nums text-ui-text-3">{runs.length}</span>
      </header>

      {runs.length === 0 ? (
        <EmptyState
          title={t('runs.empty.title')}
          description={t('runs.empty.description')}
          icon={<PulseIcon />}
        />
      ) : (
        <RunList runs={runs} now={now} onOpen={open} />
      )}
    </div>
  )
}

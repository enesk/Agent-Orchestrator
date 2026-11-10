import { isTranslationKey } from '@shared/i18n'
import type { ActiveRun } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { modelLabel } from '../agents/agentHelpers'
import { cn } from '../../ui'

/**
 * Spaltenraster im Stil der Projektliste: schmal nur Projekt, letzte Aktion und Laufzeit;
 * ab 640 px kommen Anlass, Agent und Modell dazu.
 *
 * Für die Kosten je Lauf ist hier Platz gelassen — sie kommen aus einem anderen Zweig und
 * bekommen dann eine eigene Spalte zwischen Modell und Laufzeit.
 */
const GRID = cn(
  'grid items-center gap-3 px-3.5 wide:px-5',
  'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px]',
  'sm:grid-cols-[minmax(110px,0.9fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_96px_82px_64px]',
)

interface RunListProps {
  runs: ActiveRun[]
  /** Gemeinsame Uhr aller Zeilen — eine pro Ansicht, nicht eine pro Lauf. */
  now: number
  onOpen: (run: ActiveRun) => void
}

export function RunList({ runs, now, onOpen }: RunListProps) {
  const t = useT()

  return (
    <div className="max-w-[1040px] text-[13px] leading-[1.4]">
      <div
        className={cn(
          GRID,
          'sticky top-[50px] z-[4] h-[30px] border-b border-ui-line bg-ui-bg text-[11px] text-ui-text-3',
        )}
      >
        <span>{t('runs.column.project')}</span>
        <span className="hidden sm:block">{t('runs.column.occasion')}</span>
        <span>{t('runs.column.action')}</span>
        <span className="hidden sm:block">{t('runs.column.agent')}</span>
        <span className="hidden sm:block">{t('runs.column.model')}</span>
        <span className="text-right">{t('runs.column.runtime')}</span>
      </div>

      {runs.map((run) => (
        <RunRow key={run.id} run={run} now={now} onOpen={() => onOpen(run)} />
      ))}
    </div>
  )
}

interface RunRowProps {
  run: ActiveRun
  now: number
  onOpen: () => void
}

function RunRow({ run, now, onOpen }: RunRowProps) {
  const t = useT()
  const format = useFormat()
  // Ein wartender Lauf arbeitet nicht mehr: gezählt wird die Wartezeit, nicht die Laufzeit.
  const waiting = run.waitingQuestionId !== null
  const started = Date.parse(waiting ? (run.waitingSince ?? run.startedAt) : run.startedAt)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(GRID, 'h-9 w-full border-b border-ui-line text-left hover:bg-ui-panel-2')}
    >
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <i
          aria-hidden="true"
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            // Derselbe Punkt, nur in Warnfarbe — mehr braucht der Unterschied nicht.
            waiting ? 'bg-ui-warn' : 'bg-ui-ok',
          )}
        />
        <span className={cn('truncate', waiting && 'text-ui-text-2')}>{run.projectName}</span>
      </span>

      <span className="hidden min-w-0 truncate text-ui-text-2 sm:block">{occasion(run, t)}</span>

      <span className={cn('min-w-0 truncate', waiting ? 'text-ui-warn' : 'text-ui-text-3')}>
        {waiting ? t('runs.waiting') : (run.tool ?? t('runs.thinking'))}
      </span>

      <span className="hidden min-w-0 truncate text-ui-text-3 sm:block">{run.agentName}</span>

      <span className="hidden min-w-0 truncate text-ui-text-3 sm:block">
        {modelLabel(run.model)}
      </span>

      <span className="whitespace-nowrap text-right tabular-nums text-ui-text-3">
        {Number.isNaN(started) ? '–' : format.duration(Math.max(0, now - started))}
      </span>
    </button>
  )
}

/**
 * Woran der Lauf hängt: am liebsten das Ticket, sonst das Vorhaben, sonst der Anlass aus dem
 * Etikett des Laufs — ein Chat hat weder Ticket noch Vorhaben.
 */
function occasion(run: ActiveRun, t: ReturnType<typeof useT>): string {
  if (run.ticketNumber !== null) {
    const number = t('runs.ticket', { number: run.ticketNumber })
    return run.ticketTitle ? `${number} · ${run.ticketTitle}` : number
  }
  if (run.goalTitle) return run.goalTitle
  const key = `runs.label.${run.label ?? ''}`
  if (isTranslationKey(key)) return t(key)
  return run.label ?? '–'
}

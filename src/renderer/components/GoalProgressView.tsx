import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../i18n/LanguageContext'
import { useIpc } from '../hooks/useIpc'
import { RichTextViewer } from './RichTextEditor'
import type { ProjectGoal, GoalRunLog, GoalPhaseUpdate, GoalPhase } from '@shared/types'

interface Props {
  projectId: string
}

const PHASES: { key: GoalPhase; translationKey: string }[] = [
  { key: 'pflichtenheft', translationKey: 'goal.phasePflichtenheft' },
  { key: 'ticket_creation', translationKey: 'goal.phaseTickets' },
  { key: 'ticket_work', translationKey: 'goal.phaseWork' },
  { key: 'review', translationKey: 'goal.phaseReview' },
  { key: 'done', translationKey: 'goal.phaseDone' },
]

export default function GoalProgressView({ projectId }: Props) {
  const { t } = useLanguage()
  const ipc = useIpc()
  const [goals, setGoals] = useState<ProjectGoal[]>([])
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null)
  const [logs, setLogs] = useState<GoalRunLog[]>([])
  const [phaseUpdates, setPhaseUpdates] = useState<Map<number, Map<GoalPhase, GoalPhaseUpdate>>>(new Map())

  // Initial load only (no polling)
  useEffect(() => {
    ipc.goals.getAll(projectId).then(setGoals).catch(() => {})
  }, [projectId])

  // Event-driven updates — no polling
  useEffect(() => {
    // Phase updates (running/success/failed per phase)
    const unsub1 = ipc.goals.onPhaseUpdate((update) => {
      setPhaseUpdates((prev) => {
        const next = new Map(prev)
        const goalMap = next.get(update.goalId) || new Map()
        goalMap.set(update.phase, update)
        next.set(update.goalId, goalMap)
        return next
      })
    })

    // Goal completed
    const unsub2 = ipc.goals.onComplete(() => {})

    // Goal failed
    const unsub3 = ipc.goals.onFailed(() => {})

    // Full goal state pushes (replaces polling)
    const unsub4 = ipc.goals.onGoalUpdate((goal) => {
      if (goal.projectId !== projectId) return
      setGoals((prev) => {
        const idx = prev.findIndex((g) => g.id === goal.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = goal
          return next
        }
        return [goal, ...prev]
      })
    })

    // Log entry pushes (replaces polling)
    const unsub5 = ipc.goals.onLogEntry(({ goalId, log }) => {
      if (goalId !== expandedGoalId) return
      setLogs((prev) => {
        const idx = prev.findIndex((l) => l.id === log.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = log
          return next
        }
        return [...prev, log]
      })
    })

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  }, [projectId, expandedGoalId])

  // Fetch logs once when expanding a goal
  useEffect(() => {
    if (expandedGoalId == null) { setLogs([]); return }
    ipc.goals.getLog(expandedGoalId).then(setLogs).catch(() => {})
  }, [expandedGoalId])

  if (goals.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-500" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <p className="text-txt-secondary text-sm">{t('goal.noGoals')}</p>
        <p className="text-txt-muted text-xs mt-1">{t('goal.noGoalsDesc')}</p>
      </div>
    )
  }

  // Selected-ticket goals only run the work phase — hide the AI-pipeline phases.
  const phasesForGoal = (goal: ProjectGoal) =>
    goal.mode === 'selected'
      ? PHASES.filter((p) => p.key === 'ticket_work' || p.key === 'done')
      : PHASES

  const getPhaseStatus = (goal: ProjectGoal, phase: GoalPhase): 'pending' | 'running' | 'success' | 'failed' => {
    const updates = phaseUpdates.get(goal.id)
    if (updates?.has(phase)) {
      return updates.get(phase)!.status
    }

    const phaseIndex = PHASES.findIndex((p) => p.key === phase)
    const currentIndex = PHASES.findIndex((p) => p.key === goal.currentPhase)

    if (goal.status === 'done') return 'success'
    if (goal.status === 'cancelled' || goal.status === 'failed') {
      if (phaseIndex <= currentIndex) return phaseIndex === currentIndex ? 'failed' : 'success'
      return 'pending'
    }
    if (phaseIndex < currentIndex) return 'success'
    if (phaseIndex === currentIndex) return 'running'
    return 'pending'
  }

  const handleCancel = async (goalId: number) => {
    await ipc.goals.cancel(goalId)
  }

  const handleRetry = async (goalId: number) => {
    await ipc.goals.retry(goalId)
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => (
        <div key={goal.id} className="rounded-xl bg-surface border border-border overflow-hidden">
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-light/50 transition-colors"
            onClick={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
          >
            {/* Status indicator */}
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              goal.status === 'done' ? 'bg-status-success' :
              goal.status === 'failed' || goal.status === 'cancelled' ? 'bg-status-error' :
              'bg-accent animate-pulse'
            }`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-txt-primary truncate">{goal.title}</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md ${
                  goal.status === 'done' ? 'bg-status-success/10 text-status-success' :
                  goal.status === 'failed' ? 'bg-status-error/10 text-status-error' :
                  goal.status === 'cancelled' ? 'bg-txt-muted/10 text-txt-muted' :
                  'bg-accent/10 text-accent'
                }`}>
                  {goal.status === 'done' ? t('goal.completed') :
                   goal.status === 'failed' ? t('goal.failed') :
                   goal.status === 'cancelled' ? t('goal.cancelled') :
                   t('goal.running')}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              {/* Retry button for failed goals */}
              {goal.status === 'failed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRetry(goal.id) }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                  </svg>
                  {t('goal.retry')}
                </button>
              )}

              {/* Cancel button for active goals */}
              {!['done', 'cancelled', 'failed'].includes(goal.status) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancel(goal.id) }}
                  className="px-2 py-1 text-xs text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
                >
                  {t('goal.cancel')}
                </button>
              )}
            </div>

            {/* Chevron */}
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-txt-muted transition-transform ${expandedGoalId === goal.id ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* Expanded content */}
          <AnimatePresence>
            {expandedGoalId === goal.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 border-t border-border">
                  {/* Error message for failed goals */}
                  {goal.status === 'failed' && goal.errorMessage && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-status-error/5 border border-status-error/20">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-status-error mb-0.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {goal.errorType || 'Fehler'}
                      </div>
                      <p className="text-xs text-status-error/80">{goal.errorMessage}</p>
                    </div>
                  )}

                  {/* Description */}
                  {goal.description && (
                    <div className="py-3 border-b border-border">
                      <RichTextViewer content={goal.description} className="text-sm" />
                    </div>
                  )}
                  {/* Phase stepper */}
                  <div className="py-3 space-y-2">
                    {phasesForGoal(goal).map((phase, i) => {
                      const status = getPhaseStatus(goal, phase.key)
                      const update = phaseUpdates.get(goal.id)?.get(phase.key)
                      return (
                        <div key={phase.key} className="flex items-center gap-3">
                          {/* Step indicator */}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            status === 'success' ? 'bg-status-success text-white' :
                            status === 'running' ? 'bg-accent text-white animate-pulse' :
                            status === 'failed' ? 'bg-status-error text-white' :
                            'bg-surface-light text-txt-muted'
                          }`}>
                            {status === 'success' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : status === 'failed' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            ) : status === 'running' ? (
                              <div className="w-2 h-2 bg-white rounded-full" />
                            ) : (
                              <span>{i + 1}</span>
                            )}
                          </div>

                          {/* Label */}
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm ${
                              status === 'running' ? 'text-accent font-medium' :
                              status === 'success' ? 'text-txt-primary' :
                              status === 'failed' ? 'text-status-error' :
                              'text-txt-muted'
                            }`}>
                              {t(phase.translationKey as Parameters<typeof t>[0])}
                            </span>
                            {update?.message && (
                              <span className="ml-2 text-xs text-txt-muted">{update.message}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Run log */}
                  {logs.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      <div className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Log</div>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {logs.map((entry) => (
                          <div key={entry.id} className="flex items-start gap-2 text-xs">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                              entry.status === 'success' ? 'bg-status-success' :
                              entry.status === 'failed' ? 'bg-status-error' :
                              'bg-accent animate-pulse'
                            }`} />
                            <span className="text-txt-muted">
                              {entry.agentName && <span className="font-medium text-txt-secondary">{entry.agentName}: </span>}
                              {entry.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

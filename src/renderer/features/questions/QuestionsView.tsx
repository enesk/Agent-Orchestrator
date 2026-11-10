import { useEffect, useMemo, useState } from 'react'
import type { QuestionStatus } from '@shared/types'
import { useT } from '../../i18n'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useProjectStore } from '../../store/projectStore'
import { useQuestionStore } from '../../store/questionStore'
import { useUiStore } from '../../store/uiStore'
import { Button, EmptyState, Spinner, cn, useConfirm } from '../../ui'
import { ChatIcon } from '../../ui/icons'
import { QuestionCard } from './QuestionCard'

/**
 * Offene Rückfragen über alle Projekte. Projektübergreifend, weil eine wartende Frage nicht
 * davon abhängen darf, welches Projekt gerade offen ist — genau daran ist es bisher
 * gescheitert.
 */
export function QuestionsView() {
  const t = useT()
  const activeProjectId = useUiStore((state) => state.activeProjectId)

  const questions = useQuestionStore((state) => state.questions)
  const filter = useQuestionStore((state) => state.filter)
  const projectId = useQuestionStore((state) => state.projectId)
  const loading = useQuestionStore((state) => state.loading)
  const storeError = useQuestionStore((state) => state.error)
  const load = useQuestionStore((state) => state.load)
  const setFilter = useQuestionStore((state) => state.setFilter)
  const setProject = useQuestionStore((state) => state.setProject)
  const answer = useQuestionStore((state) => state.answer)
  const discard = useQuestionStore((state) => state.discard)

  const allAgents = useAgentStore((state) => state.allAgents)
  const loadAllAgents = useAgentStore((state) => state.loadAll)
  const projects = useProjectStore((state) => state.projects)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    void load()
    void loadAllAgents()
  }, [load, loadAllAgents])

  const agentById = useMemo(
    () => new Map(allAgents.map((agent) => [agent.id, agent])),
    [allAgents],
  )
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  async function run(id: string, action: () => Promise<unknown>): Promise<void> {
    setBusyId(id)
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setBusyId(null)
    }
  }

  async function onDiscard(id: string): Promise<void> {
    const confirmed = await confirm({
      title: t('questions.discardTitle'),
      message: t('questions.discardMessage'),
      confirmLabel: t('questions.discard'),
      danger: true,
    })
    if (!confirmed) return
    await run(id, () => discard(id))
  }

  const filters: { value: QuestionStatus | null; label: string }[] = [
    { value: 'open', label: t('questions.filter.open') },
    { value: null, label: t('questions.filter.all') },
  ]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-ink">{t('questions.title')}</h1>
          <p className="mt-0.5 max-w-xl text-xs text-ink-muted">{t('questions.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {filters.map((entry) => (
            <Button
              key={entry.label}
              size="sm"
              variant={filter === entry.value ? 'secondary' : 'ghost'}
              className={cn(filter === entry.value && 'text-ink')}
              onClick={() => void setFilter(entry.value)}
            >
              {entry.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={projectId === null ? 'ghost' : 'secondary'}
            disabled={activeProjectId === null}
            onClick={() => void setProject(projectId === null ? activeProjectId : null)}
          >
            {projectId === null ? t('questions.scope.project') : t('questions.scope.all')}
          </Button>
        </div>
      </header>

      {(storeError ?? actionError) && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          {storeError ?? actionError}
        </p>
      )}

      {loading && questions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<ChatIcon />}
          title={t('questions.empty.title')}
          description={t('questions.empty.description')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              agent={agentById.get(question.agentId) ?? null}
              projectName={projectById.get(question.projectId)?.name ?? null}
              busy={busyId === question.id}
              onAnswer={(text) => void run(question.id, () => answer(question.id, text))}
              onDiscard={() => void onDiscard(question.id)}
            />
          ))}
        </div>
      )}

      {dialog}
    </div>
  )
}

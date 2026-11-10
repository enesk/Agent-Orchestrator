import { useState } from 'react'
import type { AgentQuestion, ProjectAgent } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { Badge, Button, Textarea } from '../../ui'
import { AgentAvatar } from '../agents/AgentAvatar'

export interface QuestionCardProps {
  question: AgentQuestion
  agent: ProjectAgent | null
  projectName: string | null
  busy: boolean
  onAnswer: (answer: string) => void
  onDiscard: () => void
}

/**
 * Eine Rückfrage mit ihrem Kontext. Bei einer Ja/Nein-Freigabe genügen die beiden
 * vorgeschlagenen Knöpfe — ein Klick schickt die Antwort ab, ohne Umweg über das Textfeld.
 * Freitext bleibt immer daneben stehen.
 */
export function QuestionCard({
  question,
  agent,
  projectName,
  busy,
  onAnswer,
  onDiscard,
}: QuestionCardProps) {
  const t = useT()
  const format = useFormat()
  const [draft, setDraft] = useState('')
  const open = question.status === 'open'

  const origin = question.ticketId
    ? t('questions.ticket', { number: question.ticketNumber ?? 0 })
    : question.goalId !== null
      ? t('questions.goal', { id: question.goalId })
      : t('questions.chat')

  return (
    <article className="rounded-lg border border-line bg-surface p-3">
      <header className="flex items-start gap-2">
        {agent && (
          <AgentAvatar name={agent.name} color={agent.color} avatar={agent.avatar} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">{agent?.name ?? '—'}</span>
            <Badge tone="neutral">{origin}</Badge>
            {projectName && <Badge tone="neutral">{projectName}</Badge>}
            {!open && (
              <Badge tone={question.status === 'answered' ? 'success' : 'warning'}>
                {t(`questions.status.${question.status}`)}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {t('questions.askedAt', { when: format.relative(question.askedAt) })}
            {open && ` · ${t('questions.expiresAt', { when: format.date(question.expiresAt) })}`}
          </p>
        </div>
      </header>

      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {question.question}
      </p>

      {question.context && (
        <div className="mt-2 rounded-md border border-line bg-raised p-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            {t('questions.context')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
            {question.context}
          </p>
        </div>
      )}

      {!open && question.answer && (
        <p className="mt-2 text-xs text-ink-muted">
          {t('questions.answered', { answer: question.answer })}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {question.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => onAnswer(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          )}

          <Textarea
            rows={question.options.length > 0 ? 2 : 3}
            value={draft}
            placeholder={t('questions.answerPlaceholder')}
            hint={t('questions.answerHint')}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || draft.trim().length === 0}
              onClick={() => onAnswer(draft)}
            >
              {t('questions.send')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDiscard}>
              {t('questions.discard')}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

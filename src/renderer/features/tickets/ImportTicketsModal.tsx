import { useMemo, useState, type ChangeEvent } from 'react'
import type { Ticket } from '@shared/types'
import {
  isSupportedSchemaVersion,
  planTicketImport,
  ticketImportFileSchema,
} from '@shared/ticketImport'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useTicketStore, type TicketImportResult } from '../../store/ticketStore'
import { Button, Modal, Textarea } from '../../ui'

interface Preview {
  created: number
  updated: number
  issues: string[]
  /** Die zusätzlich mitgeführten Ticketfelder — Namen, nicht nur eine Zahl. */
  carried: string[]
  guidelines: { title: string; sections: number; chars: number } | null
  /** Was sich nicht abbilden lässt. Wird ausdrücklich genannt, nicht verschwiegen. */
  unrepresented: string[]
  warnings: string[]
}

const EMPTY: Omit<Preview, 'issues'> = {
  created: 0,
  updated: 0,
  carried: [],
  guidelines: null,
  unrepresented: [],
  warnings: [],
}

export interface ImportTicketsModalProps {
  open: boolean
  projectId: string
  tickets: Ticket[]
  onClose: () => void
}

export function ImportTicketsModal({ open, projectId, tickets, onClose }: ImportTicketsModalProps) {
  const t = useT()
  const importJson = useTicketStore((state) => state.importJson)

  const [json, setJson] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TicketImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const knownExternalIds = useMemo(
    () => new Set(tickets.map((ticket) => ticket.externalId).filter((id): id is string => !!id)),
    [tickets],
  )

  const preview = useMemo<Preview | null>(() => {
    if (!json.trim()) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch (caught) {
      return { ...EMPTY, issues: [`JSON: ${toErrorMessage(caught)}`] }
    }

    const checked = ticketImportFileSchema.safeParse(parsed)
    if (!checked.success) {
      return {
        ...EMPTY,
        issues: checked.error.issues.map(
          (issue) =>
            `${issue.path.length ? issue.path.join('.') : t('ticketImport.root')}: ${issue.message}`,
        ),
      }
    }

    const issues: string[] = []
    if (!isSupportedSchemaVersion(checked.data.meta.schema_version)) {
      issues.push(t('ticketImport.unsupportedVersion'))
    }
    if (checked.data.tickets.length === 0) {
      issues.push(t('ticketImport.noTickets'))
    }
    if (issues.length > 0) return { ...EMPTY, issues }

    // Dieselbe Planung wie im Hauptprozess — die Vorschau kann sich dadurch nicht irren.
    const plan = planTicketImport(checked.data, {
      existingExternalIds: [...knownExternalIds],
    })
    return {
      created: plan.tickets.filter((ticket) => ticket.isNew).length,
      updated: plan.tickets.filter((ticket) => !ticket.isNew).length,
      issues: [],
      carried: plan.carriedTicketFields,
      guidelines: plan.guidelines
        ? {
            title: plan.guidelines.title,
            sections: plan.guidelines.sectionKeys.length,
            chars: plan.guidelines.charCount,
          }
        : null,
      unrepresented: plan.unrepresented,
      warnings: plan.warnings,
    }
  }, [json, knownExternalIds, t])

  function reset(): void {
    setJson('')
    setFileName(null)
    setResult(null)
    setError(null)
    setRunning(false)
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setError(null)
    setJson(await file.text())
  }

  async function runImport(): Promise<void> {
    setRunning(true)
    setError(null)
    try {
      setResult(await importJson(projectId, json))
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setRunning(false)
    }
  }

  const importable = !!preview && preview.issues.length === 0

  return (
    <Modal
      open={open}
      title={t('ticketImport.title')}
      width="lg"
      onClose={() => {
        reset()
        onClose()
      }}
      footer={
        <>
          <Button
            onClick={() => {
              reset()
              onClose()
            }}
          >
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          {!result && (
            <Button
              variant="primary"
              loading={running}
              disabled={!importable}
              onClick={() => void runImport()}
            >
              {t('ticketImport.run')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line bg-raised px-3 text-sm text-ink hover:bg-overlay">
            {t('ticketImport.pickFile')}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void pickFile(event)}
            />
          </label>
          <span className="truncate text-xs text-ink-faint">
            {fileName ?? t('ticketImport.orPaste')}
          </span>
        </div>

        <Textarea
          label="JSON"
          rows={12}
          value={json}
          className="font-mono text-xs"
          placeholder='{ "meta": { "schema_version": "1.0.0" }, "tickets": [ … ] }'
          onChange={(event) => {
            setJson(event.target.value)
            setResult(null)
            setError(null)
          }}
        />

        {preview && preview.issues.length > 0 && (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-2">
            <p className="mb-1 text-xs font-medium text-danger">{t('ticketImport.invalid')}</p>
            <ul className="space-y-0.5">
              {preview.issues.map((issue) => (
                <li key={issue} className="font-mono text-[11px] text-danger">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {importable && !result && (
          <div className="space-y-1 rounded-md border border-line bg-raised px-2 py-1.5 text-xs text-ink-muted">
            <p>
              {t('ticketImport.preview', { created: preview.created, updated: preview.updated })}
            </p>
            <p>
              {preview.carried.length > 0
                ? t('ticketImport.carriedFields', {
                    count: preview.carried.length,
                    names: preview.carried.join(', '),
                  })
                : t('ticketImport.carriedNone')}
            </p>
            <p>
              {preview.guidelines
                ? t('ticketImport.guidelinesDoc', {
                    title: preview.guidelines.title,
                    sections: preview.guidelines.sections,
                    chars: preview.guidelines.chars,
                  })
                : t('ticketImport.guidelinesNone')}
            </p>
            {preview.unrepresented.length > 0 && (
              <p className="text-warning">
                {t('ticketImport.unrepresented', { names: preview.unrepresented.join(', ') })}
              </p>
            )}
            {preview.warnings.map((warning) => (
              <p key={warning} className="text-warning">
                {warning}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2 rounded-md border border-line bg-raised p-2">
            <p className="text-xs text-ink">
              {t('ticketImport.done', { created: result.created, updated: result.updated })}
            </p>
            {result.guidelines && (
              <p className="text-[11px] text-ink-muted">
                {t(
                  result.guidelines.created
                    ? 'ticketImport.guidelinesCreated'
                    : 'ticketImport.guidelinesUpdated',
                  {
                    title: result.guidelines.title,
                    sections: result.guidelines.sectionKeys.length,
                    chars: result.guidelines.charCount,
                  },
                )}
              </p>
            )}
            {result.unrepresented.length > 0 && (
              <p className="text-[11px] text-warning">
                {t('ticketImport.unrepresented', { names: result.unrepresented.join(', ') })}
              </p>
            )}
            {result.warnings.length > 0 && (
              <ul className="space-y-0.5">
                {result.warnings.map((warning) => (
                  <li key={warning} className="text-[11px] text-warning">
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

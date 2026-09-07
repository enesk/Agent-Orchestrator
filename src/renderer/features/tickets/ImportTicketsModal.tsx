import { useMemo, useState, type ChangeEvent } from 'react'
import type { Ticket } from '@shared/types'
import { isSupportedSchemaVersion, ticketImportFileSchema } from '@shared/ticketImport'
import { toErrorMessage } from '../../store/errorMessage'
import { useTicketStore, type TicketImportResult } from '../../store/ticketStore'
import { Button, Modal, Textarea } from '../../ui'

interface Preview {
  created: number
  updated: number
  issues: string[]
}

export interface ImportTicketsModalProps {
  open: boolean
  projectId: string
  tickets: Ticket[]
  onClose: () => void
}

export function ImportTicketsModal({ open, projectId, tickets, onClose }: ImportTicketsModalProps) {
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
      return { created: 0, updated: 0, issues: [`JSON: ${toErrorMessage(caught)}`] }
    }

    const checked = ticketImportFileSchema.safeParse(parsed)
    if (!checked.success) {
      return {
        created: 0,
        updated: 0,
        issues: checked.error.issues.map(
          (issue) => `${issue.path.length ? issue.path.join('.') : 'Wurzel'}: ${issue.message}`,
        ),
      }
    }

    const issues: string[] = []
    if (!isSupportedSchemaVersion(checked.data.meta.schema_version)) {
      issues.push('meta.schema_version: Es werden nur Versionen 1.x.x unterstützt')
    }
    if (checked.data.tickets.length === 0) {
      issues.push('tickets: Die Datei enthält keine Tickets')
    }
    if (issues.length > 0) return { created: 0, updated: 0, issues }

    let created = 0
    let updated = 0
    for (const ticket of checked.data.tickets) {
      if (knownExternalIds.has(ticket.id)) updated += 1
      else created += 1
    }
    return { created, updated, issues: [] }
  }, [json, knownExternalIds])

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
      title="Tickets importieren"
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
            {result ? 'Schließen' : 'Abbrechen'}
          </Button>
          {!result && (
            <Button
              variant="primary"
              loading={running}
              disabled={!importable}
              onClick={() => void runImport()}
            >
              Importieren
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line bg-raised px-3 text-sm text-ink hover:bg-overlay">
            Datei wählen
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void pickFile(event)}
            />
          </label>
          <span className="truncate text-xs text-ink-faint">
            {fileName ?? 'Oder JSON unten einfügen'}
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
            <p className="mb-1 text-xs font-medium text-danger">Die Datei ist nicht gültig:</p>
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
          <p className="rounded-md border border-line bg-raised px-2 py-1.5 text-xs text-ink-muted">
            {preview.created} neu, {preview.updated} aktualisiert
          </p>
        )}

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2 rounded-md border border-line bg-raised p-2">
            <p className="text-xs text-ink">
              Import abgeschlossen: {result.created} neu, {result.updated} aktualisiert.
            </p>
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

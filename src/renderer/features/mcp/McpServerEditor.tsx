import { useEffect, useMemo, useState } from 'react'
import { baseMcpServerName } from '@shared/mcpServerName'
import type { McpProbeResult, McpServer, McpTransport } from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useMcpStore } from '../../store/mcpStore'
import { Button, IconButton, Input, Select, Textarea, cn } from '../../ui'
import { CloseIcon, PlusIcon } from '../../ui/icons'
import {
  MCP_TRANSPORTS,
  samePairs,
  storedPairs,
  transportLabelKey,
  type PairDraft,
} from './mcpHelpers'

interface Draft {
  name: string
  transport: McpTransport
  url: string
  command: string
  args: string[]
  description: string
  headers: PairDraft[]
  env: PairDraft[]
}

function toDraft(server: McpServer): Draft {
  return {
    name: server.name,
    transport: server.transport,
    url: server.url ?? '',
    command: server.command ?? '',
    args: [...server.args],
    description: server.description,
    headers: storedPairs(server.headerKeys),
    env: storedPairs(server.envKeys),
  }
}

export interface McpServerEditorProps {
  server: McpServer
  onDelete: () => void
}

export function McpServerEditor({ server, onDelete }: McpServerEditorProps) {
  const t = useT()
  const format = useFormat()
  const update = useMcpStore((state) => state.update)

  const [draft, setDraft] = useState<Draft>(() => toDraft(server))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<McpProbeResult | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(toDraft(server))
    setError(null)
    setSaved(false)
    setProbe(null)
    setProbeError(null)
    // Bewusst nur an der Id: fremde Aktualisierungen dürfen den offenen Entwurf nicht überschreiben.
  }, [server.id])

  const current = toDraft(server)
  const dirty =
    draft.name !== current.name ||
    draft.transport !== current.transport ||
    draft.url !== current.url ||
    draft.command !== current.command ||
    draft.description !== current.description ||
    draft.args.join('\u0000') !== current.args.join('\u0000') ||
    !samePairs(draft.headers, current.headers) ||
    !samePairs(draft.env, current.env)

  const namePreview = useMemo(() => baseMcpServerName(draft.name), [draft.name])
  const isStdio = draft.transport === 'stdio'
  const targetMissing = isStdio ? !draft.command.trim() : !draft.url.trim()

  function set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setSaved(false)
  }

  async function save(): Promise<void> {
    if (!draft.name.trim() || targetMissing) return
    setSaving(true)
    setError(null)
    try {
      const next = await update(server.id, {
        name: draft.name.trim(),
        transport: draft.transport,
        url: isStdio ? null : draft.url.trim(),
        command: isStdio ? draft.command.trim() : null,
        args: draft.args,
        description: draft.description,
        headers: draft.headers.filter((pair) => pair.key.trim()),
        env: draft.env.filter((pair) => pair.key.trim()),
      })
      // Der Main-Prozess kann den Namen um einen Zähler ergänzt haben.
      setDraft(toDraft(next))
      setSaved(true)
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function runProbe(): Promise<void> {
    setProbing(true)
    setProbe(null)
    setProbeError(null)
    try {
      setProbe(await window.api.mcp.probe({ id: server.id }))
    } catch (caught) {
      setProbeError(t('mcp.probe.failed', { error: toErrorMessage(caught) }))
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {draft.name || server.name}
        </h2>
        <span className="text-xs text-ink-faint">
          {dirty ? t('agentEditor.unsaved') : saved ? t('common.saved') : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          loading={probing}
          title={dirty ? t('mcp.probe.unsaved') : t('mcp.probeHint')}
          onClick={() => void runProbe()}
        >
          {t('mcp.probe')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {t('common.delete')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={!dirty || !draft.name.trim() || targetMissing}
          onClick={() => void save()}
        >
          {t('common.save')}
        </Button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <ProbeReport error={probeError} result={probe} />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('mcp.name')}
            value={draft.name}
            className="font-mono"
            onChange={(event) => set('name', event.target.value)}
            placeholder={t('mcp.namePlaceholder')}
            hint={t('mcp.nameHint', { name: namePreview })}
          />
          <Select
            label={t('mcp.transport')}
            value={draft.transport}
            onChange={(event) => set('transport', event.target.value as McpTransport)}
            options={MCP_TRANSPORTS.map((transport) => ({
              value: transport,
              label: t(transportLabelKey(transport)),
            }))}
          />
        </div>

        {isStdio ? (
          <>
            <Input
              label={t('mcp.command')}
              value={draft.command}
              className="font-mono"
              onChange={(event) => set('command', event.target.value)}
              placeholder={t('mcp.commandPlaceholder')}
              hint={t('mcp.commandHint')}
            />
            <Textarea
              label={t('mcp.args')}
              rows={3}
              className="font-mono"
              value={draft.args.join('\n')}
              onChange={(event) => set('args', event.target.value.split('\n'))}
              hint={t('mcp.argsHint')}
            />
          </>
        ) : (
          <Input
            label={t('mcp.url')}
            value={draft.url}
            className="font-mono"
            onChange={(event) => set('url', event.target.value)}
            placeholder="http://127.0.0.1:4444/mcp"
            hint={t('mcp.urlHint')}
          />
        )}

        <Textarea
          label={t('mcp.description')}
          rows={2}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder={t('mcp.descriptionPlaceholder')}
        />

        <PairList
          label={isStdio ? t('mcp.env') : t('mcp.headers')}
          hint={isStdio ? t('mcp.envHint') : t('mcp.headersHint')}
          pairs={isStdio ? draft.env : draft.headers}
          onChange={(pairs) => set(isStdio ? 'env' : 'headers', pairs)}
        />

        <p className="rounded-md border border-line bg-base px-2 py-1.5 text-xs text-ink-faint">
          {t('mcp.costHint')}
        </p>

        <p className="text-xs text-ink-faint">
          {server.checkedAt
            ? t('mcp.checked', {
                when: format.dateTime(server.checkedAt),
                tools: t('mcp.probe.tools', { count: server.toolCount ?? 0 }),
              })
            : t('mcp.checkedNever')}
        </p>
      </div>
    </div>
  )
}

function ProbeReport({ error, result }: { error: string | null; result: McpProbeResult | null }) {
  const t = useT()
  if (error) {
    return (
      <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
        {error}
      </p>
    )
  }
  if (!result) return null

  return (
    <div className="rounded-md border border-success/40 bg-success/10 px-2 py-1.5 text-xs text-ink">
      <p className="font-medium">
        {result.serverName
          ? t('mcp.probe.serverInfo', {
              name: result.serverName,
              version: result.serverVersion ?? '',
            }).trim()
          : t('mcp.probe.unnamed')}{' '}
        · {t('mcp.probe.duration', { ms: result.durationMs })}
      </p>
      <p className="mt-0.5 text-ink-muted">
        {result.toolNames.length > 0
          ? t('mcp.probe.tools', { count: result.toolNames.length })
          : t('mcp.probe.noTools')}
        {' · '}
        {result.instructionsLength === null
          ? t('mcp.probe.noInstructions')
          : t('mcp.probe.instructions', { count: result.instructionsLength })}
      </p>
      {result.toolNames.length > 0 && (
        <p className="mt-1 break-words font-mono text-[11px] text-ink-faint">
          {result.toolNames.join(', ')}
        </p>
      )}
    </div>
  )
}

interface PairListProps {
  label: string
  hint: string
  pairs: PairDraft[]
  onChange: (pairs: PairDraft[]) => void
}

/**
 * Schlüssel-Wert-Paare für Header und Umgebung. Gespeicherte Werte zeigt die Oberfläche nie —
 * sie kennt sie nicht. Ein Feld mit `value === null` bleibt gesperrt, bis man es überschreibt.
 */
function PairList({ label, hint, pairs, onChange }: PairListProps) {
  const t = useT()

  function patch(index: number, next: Partial<PairDraft>): void {
    onChange(pairs.map((pair, position) => (position === index ? { ...pair, ...next } : pair)))
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <Button
          size="sm"
          icon={<PlusIcon width={14} height={14} />}
          onClick={() => onChange([...pairs, { key: '', value: '' }])}
        >
          {t('mcp.addPair')}
        </Button>
      </div>
      {pairs.length === 0 ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : (
        <>
          <div className="space-y-2">
            {pairs.map((pair, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-44 shrink-0">
                  <Input
                    value={pair.key}
                    placeholder={t('mcp.key')}
                    className="font-mono"
                    onChange={(event) => patch(index, { key: event.target.value })}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {pair.value === null ? (
                    // Gespeichert: der Wert ist der Oberfläche unbekannt. Erst ein Klick macht
                    // das Feld beschreibbar — Durchtabben darf kein Geheimnis löschen.
                    <button
                      type="button"
                      onClick={() => patch(index, { value: '' })}
                      className={cn(
                        'h-9 w-full rounded-md border border-line bg-surface px-3 text-left',
                        'text-sm text-ink-faint transition-colors hover:border-line-strong',
                      )}
                    >
                      <span className="font-mono">••••••••</span>{' '}
                      <span className="text-xs">{t('mcp.valueStored')}</span>
                    </button>
                  ) : (
                    <Input
                      type="password"
                      value={pair.value}
                      placeholder={t('mcp.value')}
                      className="font-mono"
                      onChange={(event) => patch(index, { value: event.target.value })}
                    />
                  )}
                </div>
                <IconButton
                  label={t('mcp.removePair', { key: pair.key || t('mcp.key') })}
                  icon={<CloseIcon width={16} height={16} />}
                  onClick={() => onChange(pairs.filter((_, position) => position !== index))}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-faint">{hint}</p>
        </>
      )}
    </div>
  )
}

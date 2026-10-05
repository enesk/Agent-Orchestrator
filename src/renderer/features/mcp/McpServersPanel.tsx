import { useEffect, useState } from 'react'
import type { McpServer, McpTransport } from '@shared/types'
import { useT } from '../../i18n'
import { toErrorMessage } from '../../store/errorMessage'
import { useMcpStore } from '../../store/mcpStore'
import { Button, EmptyState, Input, Modal, Select, Spinner, cn, useConfirm } from '../../ui'
import { PlusIcon, TerminalIcon } from '../../ui/icons'
import { McpServerEditor } from './McpServerEditor'
import { MCP_TRANSPORTS, describeTarget, transportLabelKey } from './mcpHelpers'

export function McpServersPanel() {
  const t = useT()
  const servers = useMcpStore((state) => state.servers)
  const loading = useMcpStore((state) => state.loading)
  const storeError = useMcpStore((state) => state.error)
  const create = useMcpStore((state) => state.create)
  const remove = useMcpStore((state) => state.remove)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [transportDraft, setTransportDraft] = useState<McpTransport>('http')
  const [targetDraft, setTargetDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    setSelectedId((current) =>
      current && servers.some((server) => server.id === current) ? current : servers[0]?.id ?? null,
    )
  }, [servers])

  const selected = servers.find((server) => server.id === selectedId) ?? null
  const isStdio = transportDraft === 'stdio'

  async function submitCreate(): Promise<void> {
    const name = nameDraft.trim()
    const target = targetDraft.trim()
    if (!name || !target) return
    setBusy(true)
    setActionError(null)
    try {
      const server = await create({
        name,
        transport: transportDraft,
        url: isStdio ? null : target,
        command: isStdio ? target : null,
      })
      setSelectedId(server.id)
      setCreateOpen(false)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function deleteServer(server: McpServer): Promise<void> {
    const confirmed = await confirm({
      title: t('mcp.delete.title'),
      message: t('mcp.delete.message', { name: server.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    setActionError(null)
    try {
      await remove(server.id)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
          <span className="text-sm font-medium text-ink">{t('mcp.title')}</span>
          {loading && <Spinner size={14} />}
          <span className="flex-1" />
          <Button
            size="sm"
            variant="primary"
            icon={<PlusIcon width={14} height={14} />}
            onClick={() => {
              setNameDraft('')
              setTransportDraft('http')
              setTargetDraft('')
              setActionError(null)
              setCreateOpen(true)
            }}
          >
            {t('mcp.new')}
          </Button>
        </div>

        {(storeError || actionError) && !createOpen && (
          <p className="border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {actionError ?? storeError}
          </p>
        )}

        <ul className="min-h-0 flex-1 overflow-auto p-2">
          {!loading && servers.length === 0 && (
            <li className="px-1 py-4 text-center text-xs text-ink-faint">{t('mcp.empty')}</li>
          )}
          {servers.map((server) => (
            <li key={server.id}>
              <button
                type="button"
                onClick={() => setSelectedId(server.id)}
                className={cn(
                  'mb-1 w-full rounded-md px-2 py-1.5 text-left transition-colors',
                  server.id === selectedId
                    ? 'bg-accent-soft text-ink'
                    : 'text-ink-muted hover:bg-raised hover:text-ink',
                )}
              >
                <span className="block truncate font-mono text-xs font-medium">{server.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                  {t(transportLabelKey(server.transport))}
                  {server.toolCount === null
                    ? ''
                    : ` · ${t('mcp.probe.tools', { count: server.toolCount })}`}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-faint">
                  {describeTarget(server)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <McpServerEditor server={selected} onDelete={() => void deleteServer(selected)} />
      ) : (
        <EmptyState
          title={t('mcp.none.title')}
          description={t('mcp.none.description')}
          icon={<TerminalIcon />}
          className="flex-1"
        />
      )}

      <Modal
        open={createOpen}
        title={t('mcp.create.title')}
        width="sm"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!nameDraft.trim() || !targetDraft.trim()}
              onClick={() => void submitCreate()}
            >
              {t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label={t('mcp.name')}
            autoFocus
            className="font-mono"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder={t('mcp.namePlaceholder')}
          />
          <Select
            label={t('mcp.transport')}
            value={transportDraft}
            onChange={(event) => setTransportDraft(event.target.value as McpTransport)}
            options={MCP_TRANSPORTS.map((transport) => ({
              value: transport,
              label: t(transportLabelKey(transport)),
            }))}
          />
          <Input
            label={isStdio ? t('mcp.command') : t('mcp.url')}
            className="font-mono"
            value={targetDraft}
            onChange={(event) => setTargetDraft(event.target.value)}
            placeholder={isStdio ? t('mcp.commandPlaceholder') : 'http://127.0.0.1:4444/mcp'}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitCreate()
            }}
          />
          {actionError && <p className="text-xs text-danger">{actionError}</p>}
        </div>
      </Modal>
      {dialog}
    </div>
  )
}

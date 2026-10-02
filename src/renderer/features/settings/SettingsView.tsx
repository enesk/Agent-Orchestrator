import { useEffect, useState } from 'react'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '@shared/i18n'
import type { AppInfo, ClaudeStatus, RemoteStatus } from '@shared/types'
import { useT } from '../../i18n'
import { useClaudeStore } from '../../store/claudeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { Badge, Button, Input, Panel, Select, Spinner, Switch } from '../../ui'
import { FolderIcon } from '../../ui/icons'

export function SettingsView() {
  const t = useT()
  const settings = useSettingsStore((state) => state.settings)
  const loading = useSettingsStore((state) => state.loading)
  const error = useSettingsStore((state) => state.error)
  const load = useSettingsStore((state) => state.load)
  const save = useSettingsStore((state) => state.save)

  useEffect(() => {
    void load()
  }, [load])

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-muted">
        {loading ? <Spinner size={14} /> : null}
        {error ?? t('settings.loading')}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <ClaudeSection claudePath={settings.claudePath} onSavePath={(path) => save({ claudePath: path })} />

      <Panel title={t('settings.behaviour')}>
        <div className="flex flex-col gap-4">
          <div>
            <Select
              label={t('settings.language')}
              options={LANGUAGE_OPTIONS}
              value={settings.language}
              onChange={(event) => void save({ language: event.target.value as Language })}
            />
            <p className="mt-1 text-xs text-ink-faint">{t('settings.languageHint')}</p>
          </div>
          <Switch
            label={t('settings.minimizeToTray')}
            hint={t('settings.minimizeToTrayHint')}
            checked={settings.minimizeToTray}
            onChange={(checked) => void save({ minimizeToTray: checked })}
          />
          <Switch
            label={t('settings.notifications')}
            hint={t('settings.notificationsHint')}
            checked={settings.notificationsEnabled}
            onChange={(checked) => void save({ notificationsEnabled: checked })}
          />
        </div>
      </Panel>

      <RemoteSection
        enabled={settings.remoteEnabled}
        port={settings.remotePort}
        webuiPath={settings.webuiPath}
        onSave={(patch) => void save(patch)}
      />

      <AboutSection />
    </div>
  )
}

/** Die Sprachnamen stehen in ihrer eigenen Sprache und werden deshalb nie übersetzt. */
const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({
  value: language,
  label: LANGUAGE_LABELS[language],
}))

// ---------------------------------------------------------------------------

interface ClaudeSectionProps {
  claudePath: string | null
  onSavePath: (path: string | null) => void
}

function ClaudeSection({ claudePath, onSavePath }: ClaudeSectionProps) {
  const t = useT()
  const status = useClaudeStore((state) => state.status)
  const setStatus = useClaudeStore((state) => state.set)
  const [draft, setDraft] = useState(claudePath ?? '')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<ClaudeStatus | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(claudePath ?? '')
  }, [claudePath])

  const commit = (value: string): void => {
    const trimmed = value.trim()
    const next = trimmed === '' ? null : trimmed
    if (next !== claudePath) onSavePath(next)
  }

  const browse = async (): Promise<void> => {
    const { path } = await window.api.settings.pickClaudePath()
    if (!path) return
    setDraft(path)
    onSavePath(path)
  }

  const check = async (): Promise<void> => {
    const trimmed = draft.trim()
    commit(trimmed)
    setChecking(true)
    setCheckError(null)
    try {
      const detected = await window.api.claude.detect({ path: trimmed === '' ? null : trimmed })
      setResult(detected)
      setStatus(detected)
    } catch (error) {
      setResult(null)
      setCheckError(error instanceof Error ? error.message : String(error))
    } finally {
      setChecking(false)
    }
  }

  const shown = result ?? status

  return (
    <Panel title={t('settings.claude.title')}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-muted">
          {t('settings.claude.intro', { command: 'claude' })}
        </p>

        <div className="flex items-end gap-2">
          <Input
            className="font-mono"
            label={t('settings.claude.path')}
            placeholder="claude"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(event.currentTarget.value)
            }}
          />
          <Button icon={<FolderIcon width={16} height={16} />} onClick={() => void browse()}>
            {t('projectForm.browse')}
          </Button>
          <Button variant="primary" loading={checking} onClick={() => void check()}>
            {t('settings.claude.check')}
          </Button>
        </div>

        {checkError && <p className="text-xs text-danger">{checkError}</p>}

        {shown && (
          <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised px-3 py-2">
            <div className="flex items-center gap-2">
              {shown.available ? (
                <Badge tone="success">{t('settings.claude.found')}</Badge>
              ) : (
                <Badge tone="danger">{t('settings.claude.notFound')}</Badge>
              )}
              <span className="text-xs text-ink-muted">
                {shown.available
                  ? shown.version ?? t('settings.claude.versionUnknown')
                  : shown.error ?? t('settings.claude.noReason')}
              </span>
            </div>
            {shown.path && <p className="truncate font-mono text-[11px] text-ink-faint">{shown.path}</p>}
          </div>
        )}

        {shown && !shown.available && (
          <p className="text-xs text-ink-muted">
            {t('settings.claude.installHint')}{' '}
            <code className="rounded bg-raised px-1 py-0.5 font-mono text-[11px] text-ink">
              npm install -g @anthropic-ai/claude-code
            </code>
          </p>
        )}
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

interface RemoteSectionProps {
  enabled: boolean
  port: number
  webuiPath: string | null
  onSave: (patch: { remoteEnabled?: boolean; remotePort?: number; webuiPath?: string | null }) => void
}

/**
 * Fernzugriff: Schalter, Port, Adressen zum Abtippen und die Zahl verbundener Geräte. Der
 * Zustand kommt aus dem Main-Prozess und wird über `remote.changed` nachgezogen — die Zahl der
 * Geräte ändert sich, ohne dass hier etwas gespeichert wurde.
 */
function RemoteSection({ enabled, port, webuiPath, onSave }: RemoteSectionProps) {
  const t = useT()
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [portDraft, setPortDraft] = useState(String(port))
  const [pathDraft, setPathDraft] = useState(webuiPath ?? '')
  const [portError, setPortError] = useState<string | null>(null)

  useEffect(() => {
    setPortDraft(String(port))
  }, [port])

  useEffect(() => {
    setPathDraft(webuiPath ?? '')
  }, [webuiPath])

  useEffect(() => {
    window.api.remote.status().then(setStatus).catch(() => undefined)
    return window.api.on('remote.changed', setStatus)
  }, [])

  const commitPort = (value: string): void => {
    const parsed = Number.parseInt(value.trim(), 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      setPortError(t('settings.remote.portInvalid'))
      return
    }
    setPortError(null)
    if (parsed !== port) onSave({ remotePort: parsed })
  }

  const commitPath = (value: string): void => {
    const trimmed = value.trim()
    const next = trimmed === '' ? null : trimmed
    if (next !== webuiPath) onSave({ webuiPath: next })
  }

  return (
    <Panel title={t('settings.remote')}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-ink-muted">{t('settings.remote.intro')}</p>

        <Switch
          label={t('settings.remote.enable')}
          hint={t('settings.remote.enableHint')}
          checked={enabled}
          onChange={(checked) => onSave({ remoteEnabled: checked })}
        />

        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {t('settings.remote.warning')}
        </p>

        <div className="flex items-end gap-2">
          <Input
            className="w-28 font-mono"
            label={t('settings.remote.port')}
            value={portDraft}
            inputMode="numeric"
            onChange={(event) => setPortDraft(event.target.value)}
            onBlur={(event) => commitPort(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitPort(event.currentTarget.value)
            }}
          />
          {status && (
            <Badge tone={status.running ? 'success' : 'neutral'} className="mb-2">
              {status.running ? t('settings.remote.running') : t('settings.remote.stopped')}
            </Badge>
          )}
          {status && (
            <span className="mb-2 text-xs text-ink-muted">
              {t('settings.remote.clients', { count: status.clientCount })}
            </span>
          )}
        </div>

        {portError && <p className="text-xs text-danger">{portError}</p>}
        {status?.error && <p className="text-xs text-danger">{status.error}</p>}

        <div>
          <p className="text-xs text-ink-faint">{t('settings.remote.addresses')}</p>
          {status && status.addresses.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {status.addresses.map((address) => (
                <li key={address} className="select-text font-mono text-xs text-ink">
                  {address}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">{t('settings.remote.noAddresses')}</p>
          )}
        </div>

        <div>
          <Input
            className="font-mono"
            label={t('settings.remote.webuiPath')}
            placeholder={status?.staticRoot ?? ''}
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            onBlur={(event) => commitPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitPath(event.currentTarget.value)
            }}
          />
          <p className="mt-1 text-xs text-ink-faint">
            {t('settings.remote.webuiPathHint', { path: status?.staticRoot ?? '' })}
          </p>
        </div>

        {status && (
          <p className="truncate text-[11px] text-ink-faint">
            {t('settings.remote.contractVersion')}:{' '}
            <span className="select-text font-mono">{status.contractVersion}</span>
          </p>
        )}
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

function AboutSection() {
  const t = useT()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.app
      .info()
      .then(setInfo)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [])

  if (error) {
    return (
      <Panel title={t('settings.about')}>
        <p className="text-xs text-danger">{error}</p>
      </Panel>
    )
  }

  if (!info) {
    return (
      <Panel title={t('settings.about')}>
        <p className="text-xs text-ink-muted">{t('common.loading')}</p>
      </Panel>
    )
  }

  return (
    <>
      <Panel title={t('settings.about')}>
        <dl className="flex flex-col gap-2 text-xs">
          <Row label={t('settings.about.app')} value={info.name} />
          <Row label={t('settings.about.version')} value={info.version} />
          <Row label={t('settings.about.electron')} value={info.electronVersion} />
          <Row label={t('settings.about.platform')} value={info.platform} />
        </dl>
      </Panel>

      <Panel title={t('settings.database')}>
        <div className="flex flex-col gap-3">
          <p className="break-all font-mono text-[11px] text-ink-muted">{info.databasePath}</p>
          <div className="flex gap-2">
            <Button onClick={() => void window.api.app.showDatabaseFile()}>
              {t('settings.database.reveal')}
            </Button>
            <Button
              icon={<FolderIcon width={16} height={16} />}
              onClick={() => void window.api.app.openDatabaseFolder()}
            >
              {t('settings.database.openFolder')}
            </Button>
          </div>
        </div>
      </Panel>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  )
}

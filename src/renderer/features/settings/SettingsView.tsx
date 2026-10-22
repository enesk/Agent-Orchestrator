import { useEffect, useState } from 'react'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '@shared/i18n'
import type {
  AppInfo,
  ClaudeStatus,
  PushDevice,
  PushEnvironmentChoice,
  PushSnapshot,
  PushStatus,
  PushTriggers,
  RemoteStatus,
} from '@shared/types'
import { useFormat, useT } from '../../i18n'
import { useClaudeStore } from '../../store/claudeStore'
import { useSettingsStore } from '../../store/settingsStore'
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Panel,
  Select,
  Spinner,
  Switch,
  useConfirm,
} from '../../ui'
import { FolderIcon, TrashIcon } from '../../ui/icons'

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
          <Switch
            label={t('settings.agentsMayWriteTests')}
            hint={t('settings.agentsMayWriteTestsHint')}
            checked={settings.agentsMayWriteTests}
            onChange={(checked) => void save({ agentsMayWriteTests: checked })}
          />
        </div>
      </Panel>

      <RemoteSection
        enabled={settings.remoteEnabled}
        port={settings.remotePort}
        webuiPath={settings.webuiPath}
        onSave={(patch) => void save(patch)}
      />

      <PushSection
        enabled={settings.pushEnabled}
        environment={settings.pushEnvironment}
        triggers={settings.pushTriggers}
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

interface PushSectionProps {
  enabled: boolean
  environment: PushEnvironmentChoice
  triggers: PushTriggers
  onSave: (patch: {
    pushEnabled?: boolean
    pushEnvironment?: PushEnvironmentChoice
    pushTriggers?: PushTriggers
  }) => void
}

/** Die Anlässe in der Reihenfolge, in der sie im Ticket stehen. */
const TRIGGER_KEYS: readonly (keyof PushTriggers)[] = [
  'goalDone',
  'goalFailed',
  'goalCancelled',
  'ticketStuck',
  'rateLimit',
  'chatDone',
  'liveActivity',
]

const TRIGGER_LABELS: Record<keyof PushTriggers, `settings.push.trigger.${keyof PushTriggers}`> = {
  goalDone: 'settings.push.trigger.goalDone',
  goalFailed: 'settings.push.trigger.goalFailed',
  goalCancelled: 'settings.push.trigger.goalCancelled',
  ticketStuck: 'settings.push.trigger.ticketStuck',
  rateLimit: 'settings.push.trigger.rateLimit',
  chatDone: 'settings.push.trigger.chatDone',
  liveActivity: 'settings.push.trigger.liveActivity',
}

/**
 * Benachrichtigungen aufs iPhone: Schalter, Schlüssel, Umgebung, Anlässe und die Liste der
 * angemeldeten Geräte. Der Zustand kommt aus dem Main-Prozess und wird über `push.changed`
 * nachgezogen — ein Gerät meldet sich von selbst an, ohne dass hier etwas gespeichert wurde.
 *
 * Der `.p8`-Schlüssel kommt **nie** zurück. Zu sehen ist nur, ob einer hinterlegt ist.
 */
function PushSection({ enabled, environment, triggers, onSave }: PushSectionProps) {
  const t = useT()
  const format = useFormat()
  const { confirm, dialog } = useConfirm()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [keyId, setKeyId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const apply = (snapshot: PushSnapshot): void => {
      setStatus(snapshot.status)
      setDevices(snapshot.devices)
    }
    Promise.all([window.api.push.status(), window.api.push.devices()])
      .then(([nextStatus, nextDevices]) => {
        setStatus(nextStatus)
        setDevices(nextDevices)
      })
      .catch(() => undefined)
    return window.api.on('push.changed', apply)
  }, [])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const saveIds = (): Promise<void> =>
    run(async () => {
      await window.api.push.setCredentials({ keyId: keyId.trim(), teamId: teamId.trim() })
      setKeyId('')
      setTeamId('')
    })

  const removeKey = async (): Promise<void> => {
    const confirmed = await confirm({
      title: t('settings.push.clearConfirmTitle'),
      message: t('settings.push.clearConfirmMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!confirmed) return
    await run(() => window.api.push.clearCredentials())
  }

  const idsReady = status?.hasKeyId === true && status.hasTeamId === true

  return (
    <Panel title={t('settings.push')}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-ink-muted">{t('settings.push.intro')}</p>

        <Switch
          label={t('settings.push.enable')}
          hint={t('settings.push.enableHint')}
          checked={enabled}
          onChange={(checked) => onSave({ pushEnabled: checked })}
        />

        {status && !status.safeStorageAvailable && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {t('settings.push.noSafeStorage')}
          </p>
        )}

        <p className="text-xs text-ink-faint">{t('settings.push.accountHint')}</p>

        <div className="flex items-end gap-2">
          <Input
            className="font-mono"
            label={t('settings.push.keyId')}
            placeholder={status?.hasKeyId ? t('settings.push.idsStored') : 'ABCD1234EF'}
            value={keyId}
            onChange={(event) => setKeyId(event.target.value)}
          />
          <Input
            className="font-mono"
            label={t('settings.push.teamId')}
            placeholder={status?.hasTeamId ? t('settings.push.idsStored') : 'ABCDE12345'}
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
          />
          <Button
            variant="primary"
            loading={busy}
            disabled={keyId.trim() === '' || teamId.trim() === ''}
            onClick={() => void saveIds()}
          >
            {t('settings.push.idsSave')}
          </Button>
        </div>

        <div>
          <p className="text-sm text-ink">{t('settings.push.key')}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{t('settings.push.keyHint')}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              icon={<FolderIcon width={16} height={16} />}
              loading={busy}
              disabled={!idsReady}
              onClick={() => void run(() => window.api.push.pickKeyFile())}
            >
              {t('settings.push.keyChoose')}
            </Button>
            {status?.hasKey ? (
              <Badge tone="success">
                {status.keyFileName
                  ? t('settings.push.keyStored', { name: status.keyFileName })
                  : t('settings.push.keyStoredUnnamed')}
              </Badge>
            ) : (
              <span className="text-xs text-ink-muted">{t('settings.push.keyMissing')}</span>
            )}
            {status && (status.hasKey || status.hasKeyId || status.hasTeamId) && (
              <Button variant="ghost" onClick={() => void removeKey()}>
                {t('settings.push.clear')}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {status?.lastError && (
          <p className="text-xs text-danger">
            {t('settings.push.lastError', { error: status.lastError })}
          </p>
        )}

        <div>
          <Select
            label={t('settings.push.environment')}
            options={[
              { value: 'auto', label: t('settings.push.environment.auto') },
              { value: 'sandbox', label: t('settings.push.environment.sandbox') },
              { value: 'production', label: t('settings.push.environment.production') },
            ]}
            value={environment}
            onChange={(event) =>
              onSave({ pushEnvironment: event.target.value as PushEnvironmentChoice })
            }
          />
          <p className="mt-1 text-xs text-ink-faint">{t('settings.push.environmentHint')}</p>
        </div>

        <div>
          <p className="text-sm text-ink">{t('settings.push.triggers')}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {TRIGGER_KEYS.map((key) => (
              <label key={key} className="flex items-start gap-2 text-xs text-ink">
                <Checkbox
                  className="mt-0.5"
                  checked={triggers[key]}
                  onChange={(event) =>
                    onSave({ pushTriggers: { ...triggers, [key]: event.target.checked } })
                  }
                />
                <span>
                  {t(TRIGGER_LABELS[key])}
                  {key === 'chatDone' && (
                    <span className="ml-1 text-ink-faint">
                      {t('settings.push.trigger.chatDoneHint')}
                    </span>
                  )}
                  {key === 'liveActivity' && (
                    <span className="ml-1 text-ink-faint">
                      {t('settings.push.trigger.liveActivityHint')}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-ink">{t('settings.push.devices')}</p>
          {devices.length === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">{t('settings.push.noDevices')}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {devices.map((device) => (
                <li
                  key={device.deviceToken}
                  className="flex items-start justify-between gap-3 rounded-md border border-line bg-raised px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-ink">
                      {shortDeviceToken(device.deviceToken)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                      <span>{device.bundleId}</span>
                      <Badge tone="neutral">{device.environment}</Badge>
                      {device.hasActivityToken && (
                        <Badge tone="success">{t('settings.push.deviceLiveActivity')}</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {t('settings.push.deviceSeen', { when: format.dateTime(device.lastSeenAt) })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {device.lastPushAt
                        ? t('settings.push.deviceSent', {
                            when: format.dateTime(device.lastPushAt),
                            kind: device.lastPushKind ?? '—',
                          })
                        : t('settings.push.deviceNeverSent')}
                    </p>
                    {device.lastPushError && (
                      <p className="mt-0.5 text-[11px] text-danger">{device.lastPushError}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    icon={<TrashIcon width={16} height={16} />}
                    aria-label={t('settings.push.deviceRemove', {
                      device: shortDeviceToken(device.deviceToken),
                    })}
                    onClick={() =>
                      void run(() =>
                        window.api.push.unregister({ deviceToken: device.deviceToken }),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {dialog}
    </Panel>
  )
}

/** Ein 64-stelliges Hex-Token hilft niemandem — Anfang und Ende genügen zum Wiedererkennen. */
function shortDeviceToken(token: string): string {
  return token.length <= 12 ? token : `${token.slice(0, 8)}…${token.slice(-4)}`
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

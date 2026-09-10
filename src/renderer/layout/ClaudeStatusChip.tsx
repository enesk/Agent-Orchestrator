import { useT } from '../i18n'
import { useClaudeStore } from '../store/claudeStore'
import { Badge } from '../ui'

export function ClaudeStatusChip() {
  const t = useT()
  const status = useClaudeStore((state) => state.status)
  const error = useClaudeStore((state) => state.error)

  if (error) return <Badge tone="warning">{t('claude.status.unknown')}</Badge>
  if (!status) return <Badge tone="neutral">{t('claude.status.checking')}</Badge>
  if (!status.available) return <Badge tone="danger">{t('claude.status.missing')}</Badge>

  return (
    <Badge tone="success">
      {t('claude.status.ready', { version: status.version ?? t('claude.status.readyFallback') })}
    </Badge>
  )
}

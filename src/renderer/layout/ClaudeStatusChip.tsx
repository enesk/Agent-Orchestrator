import { useClaudeStore } from '../store/claudeStore'
import { Badge } from '../ui'

export function ClaudeStatusChip() {
  const status = useClaudeStore((state) => state.status)
  const error = useClaudeStore((state) => state.error)

  if (error) return <Badge tone="warning">Claude: unbekannt</Badge>
  if (!status) return <Badge tone="neutral">Claude: prüfe …</Badge>
  if (!status.available) return <Badge tone="danger">Claude: nicht gefunden</Badge>

  return <Badge tone="success">Claude {status.version ?? 'bereit'}</Badge>
}

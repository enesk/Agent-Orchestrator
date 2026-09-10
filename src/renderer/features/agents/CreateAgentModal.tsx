import { useEffect, useMemo, useState } from 'react'
import { AGENT_ROLES, type AgentRole } from '@shared/constants'
import { useT } from '../../i18n'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, Input, Modal, Select } from '../../ui'
import { roleDescriptionKey, roleLabelKey } from './agentHelpers'

export interface CreateAgentModalProps {
  open: boolean
  onClose: () => void
  onCreated: (agentId: string) => void
}

export function CreateAgentModal({ open, onClose, onCreated }: CreateAgentModalProps) {
  const t = useT()
  const roleOptions = useMemo(
    () => AGENT_ROLES.map((option) => ({ value: option.value, label: t(roleLabelKey(option.value)) })),
    [t],
  )
  const create = useAgentStore((state) => state.create)

  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('worker')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setName('')
    setRole('worker')
    setSaving(false)
    setError(null)
  }, [open])

  async function submit(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const agent = await create({ name: trimmed, role, systemPrompt: '' })
      onCreated(agent.id)
      onClose()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('agent.create.title')}
      width="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={t('agent.create.name')}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('agent.create.namePlaceholder')}
        />
        <Select
          label={t('agent.create.role')}
          options={roleOptions}
          value={role}
          onChange={(event) => setRole(event.target.value as AgentRole)}
        />
        <p className="text-xs text-ink-faint">{t(roleDescriptionKey(role))}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

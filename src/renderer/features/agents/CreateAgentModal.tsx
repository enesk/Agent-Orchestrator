import { useEffect, useState } from 'react'
import { AGENT_ROLES, type AgentRole } from '@shared/constants'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, Input, Modal, Select } from '../../ui'

const ROLE_OPTIONS = AGENT_ROLES.map((option) => ({ value: option.value, label: option.label }))

export interface CreateAgentModalProps {
  open: boolean
  onClose: () => void
  onCreated: (agentId: string) => void
}

export function CreateAgentModal({ open, onClose, onCreated }: CreateAgentModalProps) {
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
      title="Neuer Agent"
      width="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
            Anlegen
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="z.B. Lena"
        />
        <Select
          label="Rolle"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(event) => setRole(event.target.value as AgentRole)}
        />
        <p className="text-xs text-ink-faint">
          {AGENT_ROLES.find((option) => option.value === role)?.description}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

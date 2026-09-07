import { useEffect, useState } from 'react'
import type { AgentRole } from '@shared/constants'
import { toErrorMessage } from '../../store/errorMessage'
import { Button, Modal, Textarea, useConfirm } from '../../ui'

export interface GeneratePromptModalProps {
  open: boolean
  agentName: string
  role: AgentRole
  /** Steht schon ein Systemprompt in der Textarea, wird vor dem Überschreiben gefragt. */
  hasPrompt: boolean
  onClose: () => void
  onApply: (systemPrompt: string, title: string | null) => void
}

export function GeneratePromptModal({
  open,
  agentName,
  role,
  hasPrompt,
  onClose,
  onApply,
}: GeneratePromptModalProps) {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    if (open) return
    setDescription('')
    setLoading(false)
    setError(null)
  }, [open])

  async function generate(): Promise<void> {
    const trimmed = description.trim()
    if (!trimmed) return
    if (hasPrompt) {
      const confirmed = await confirm({
        title: 'Systemprompt ersetzen',
        message: 'Der vorhandene Systemprompt wird ersetzt. Fortfahren?',
        confirmLabel: 'Ersetzen',
      })
      if (!confirmed) return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.agents.generatePrompt({
        description: trimmed,
        name: agentName.trim() || undefined,
        role,
      })
      onApply(result.systemPrompt, result.title)
      onClose()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <Modal
      open={open}
      title="Systemprompt erzeugen"
      width="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!description.trim()}
            onClick={() => void generate()}
          >
            Erzeugen
          </Button>
        </>
      }
    >
      <Textarea
        label="Kurzbeschreibung"
        autoFocus
        rows={5}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="z.B. Erfahrene Backend-Entwicklerin, arbeitet gründlich, testet ihre Änderungen selbst."
        hint="Claude schreibt daraus einen deutschen Systemprompt."
      />
      {loading && (
        <p className="mt-2 text-xs text-ink-muted">Claude schreibt den Systemprompt …</p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Modal>
    {dialog}
    </>
  )
}

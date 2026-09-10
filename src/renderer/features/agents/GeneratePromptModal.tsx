import { useEffect, useState } from 'react'
import type { AgentRole } from '@shared/constants'
import { useT } from '../../i18n'
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
  const t = useT()
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
        title: t('agents.generate.replaceTitle'),
        message: t('agents.generate.replaceMessage'),
        confirmLabel: t('agents.generate.replaceConfirm'),
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
      title={t('agents.generate.title')}
      width="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!description.trim()}
            onClick={() => void generate()}
          >
            {t('agents.generate.submit')}
          </Button>
        </>
      }
    >
      <Textarea
        label={t('agents.generate.field')}
        autoFocus
        rows={5}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t('agents.generate.placeholder')}
        hint={t('agents.generate.hint')}
      />
      {loading && (
        <p className="mt-2 text-xs text-ink-muted">{t('agents.generate.running')}</p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Modal>
    {dialog}
    </>
  )
}

import { useMemo, useState } from 'react'
import type { Project, ProjectAgent } from '@shared/types'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { Badge, Button, EmptyState, IconButton, Select, Switch, useConfirm } from '../../ui'
import { AgentIcon, ChevronDownIcon, CloseIcon } from '../../ui/icons'
import { AgentAvatar } from './AgentAvatar'
import { modelLabel, roleLabel } from './agentHelpers'

export interface ProjectAgentsPanelProps {
  project: Project
}

export function ProjectAgentsPanel({ project }: ProjectAgentsPanelProps) {
  const agents = useAgentStore((state) => state.agents)
  const allAgents = useAgentStore((state) => state.allAgents)
  const addToProject = useAgentStore((state) => state.addToProject)
  const removeFromProject = useAgentStore((state) => state.removeFromProject)
  const setStopped = useAgentStore((state) => state.setStopped)
  const move = useAgentStore((state) => state.move)

  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const available = useMemo(
    () => allAgents.filter((agent) => !agents.some((assigned) => assigned.id === agent.id)),
    [allAgents, agents],
  )

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove(agent: ProjectAgent): Promise<void> {
    const confirmed = await confirm({
      title: 'Agent entfernen',
      message: `„${agent.name}" aus dem Projekt „${project.name}" entfernen?`,
      confirmLabel: 'Entfernen',
      danger: true,
    })
    if (!confirmed) return
    await run(() => removeFromProject(project.id, agent.id))
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-3xl space-y-3">
        <header className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              label={`Agent zu „${project.name}" hinzufügen`}
              options={[
                { value: '', label: available.length ? 'Agent wählen …' : 'Alle Agenten sind zugeordnet' },
                ...available.map((agent) => ({
                  value: agent.id,
                  label: `${agent.name} — ${roleLabel(agent.role)}`,
                })),
              ]}
              value={pending}
              disabled={available.length === 0}
              onChange={(event) => setPending(event.target.value)}
            />
          </div>
          <Button
            variant="primary"
            disabled={!pending || busy}
            onClick={() =>
              void run(async () => {
                await addToProject(project.id, pending)
                setPending('')
              })
            }
          >
            Hinzufügen
          </Button>
        </header>

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}

        {agents.length === 0 ? (
          <EmptyState
            title="Diesem Projekt ist noch kein Agent zugeordnet"
            description="Ordne oben einen der globalen Agenten zu, damit er im Chat antworten kann."
            icon={<AgentIcon />}
          />
        ) : (
          <ul className="space-y-2">
            {agents.map((agent, index) => (
              <li key={agent.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <IconButton
                      label="Nach oben"
                      disabled={index === 0 || busy}
                      icon={<ChevronDownIcon className="rotate-180" width={14} height={14} />}
                      className="h-5 w-6"
                      onClick={() => void run(() => move(project.id, agent.id, -1))}
                    />
                    <IconButton
                      label="Nach unten"
                      disabled={index === agents.length - 1 || busy}
                      icon={<ChevronDownIcon width={14} height={14} />}
                      className="h-5 w-6"
                      onClick={() => void run(() => move(project.id, agent.id, 1))}
                    />
                  </div>
                  <AgentAvatar name={agent.name} color={agent.color} avatar={agent.avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm text-ink">
                      <span className="truncate font-medium">{agent.name}</span>
                      <Badge>{roleLabel(agent.role)}</Badge>
                      {agent.stopped && <Badge tone="warning">Gestoppt</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                      {agent.mentionKey} · {agent.title ?? 'Ohne Titel'} · {modelLabel(agent.model)}
                    </p>
                  </div>
                  <IconButton
                    label="Aus Projekt entfernen"
                    icon={<CloseIcon width={16} height={16} />}
                    disabled={busy}
                    onClick={() => void remove(agent)}
                  />
                </div>

                <Switch
                  className="mt-2 border-t border-line pt-2"
                  checked={agent.stopped}
                  disabled={busy}
                  label="Gestoppt — bekommt keine neuen Aufgaben"
                  hint="Laufende Antworten werden abgebrochen; die Einstellung überlebt den Neustart."
                  onChange={(checked) => void run(() => setStopped(project.id, agent.id, checked))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialog}
    </div>
  )
}

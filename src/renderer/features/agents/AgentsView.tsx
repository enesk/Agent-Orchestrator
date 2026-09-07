import { useEffect, useState } from 'react'
import type { ProjectAgent } from '@shared/types'
import { useAgentStore } from '../../store/agentStore'
import { toErrorMessage } from '../../store/errorMessage'
import { useActiveProject } from '../../store/projectStore'
import { useUiStore, type AgentsTab } from '../../store/uiStore'
import { Button, EmptyState, Spinner, cn, useConfirm } from '../../ui'
import { AgentIcon, PlusIcon } from '../../ui/icons'
import { AgentEditor } from './AgentEditor'
import { AgentList } from './AgentList'
import { AgentMemoryPanel } from './AgentMemoryPanel'
import { CreateAgentModal } from './CreateAgentModal'
import { ProjectAgentsPanel } from './ProjectAgentsPanel'

const TABS: { id: AgentsTab; label: string }[] = [
  { id: 'editor', label: 'Agenten' },
  { id: 'project', label: 'Im Projekt' },
  { id: 'memory', label: 'Gedächtnis' },
]

export function AgentsView() {
  const projectId = useUiStore((state) => state.activeProjectId)
  const project = useActiveProject()

  const allAgents = useAgentStore((state) => state.allAgents)
  const allLoading = useAgentStore((state) => state.allLoading)
  const storeError = useAgentStore((state) => state.error)
  const loadAll = useAgentStore((state) => state.loadAll)
  const load = useAgentStore((state) => state.load)
  const subscribe = useAgentStore((state) => state.subscribe)
  const create = useAgentStore((state) => state.create)
  const remove = useAgentStore((state) => state.remove)

  const tab = useUiStore((state) => state.agentsTab)
  const setTab = useUiStore((state) => state.setAgentsTab)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    void load(projectId)
  }, [projectId, load])

  useEffect(() => subscribe(), [subscribe])

  // Auswahl gültig halten, wenn Agenten dazukommen oder verschwinden.
  useEffect(() => {
    if (allAgents.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId((current) =>
      current && allAgents.some((agent) => agent.id === current) ? current : allAgents[0]!.id,
    )
  }, [allAgents])

  const selected = allAgents.find((agent) => agent.id === selectedId) ?? null

  async function duplicate(agent: ProjectAgent): Promise<void> {
    setActionError(null)
    try {
      const copy = await create({
        name: `${agent.name} (Kopie)`,
        title: agent.title,
        role: agent.role,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        effort: agent.effort,
        color: agent.color,
        avatar: agent.avatar,
      })
      setSelectedId(copy.id)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }

  async function deleteAgent(agent: ProjectAgent): Promise<void> {
    const confirmed = await confirm({
      title: 'Agent löschen',
      message: `Agent „${agent.name}" löschen? Seine Zuordnungen, Erinnerungen und Nachrichten gehen mit.`,
      confirmLabel: 'Löschen',
      danger: true,
    })
    if (!confirmed) return
    setActionError(null)
    try {
      await remove(agent.id)
    } catch (caught) {
      setActionError(toErrorMessage(caught))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              tab === entry.id
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:bg-raised hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
        <div className="flex-1" />
        {allLoading && <Spinner size={14} />}
      </header>

      {(storeError || actionError) && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {actionError ?? storeError}
        </p>
      )}

      {tab === 'project' ? (
        project ? (
          <ProjectAgentsPanel project={project} />
        ) : (
          <EmptyState
            title="Kein Projekt ausgewählt"
            description="Wähle links ein Projekt, um seine Agenten zuzuordnen."
            icon={<AgentIcon />}
          />
        )
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
              <span className="text-sm font-medium text-ink">Alle Agenten</span>
              <Button
                size="sm"
                variant="primary"
                icon={<PlusIcon width={14} height={14} />}
                onClick={() => setCreateOpen(true)}
              >
                Neu
              </Button>
            </div>
            <AgentList agents={allAgents} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>

          {selected ? (
            tab === 'memory' ? (
              <AgentMemoryPanel agent={selected} />
            ) : (
              <AgentEditor
                agent={selected}
                onDuplicate={() => void duplicate(selected)}
                onDelete={() => void deleteAgent(selected)}
              />
            )
          ) : (
            <EmptyState
              title="Noch kein Agent angelegt"
              description="Agenten gelten für alle Projekte und werden ihnen danach einzeln zugeordnet."
              icon={<AgentIcon />}
              className="flex-1"
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  Neuer Agent
                </Button>
              }
            />
          )}
        </div>
      )}

      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={setSelectedId}
      />
      {dialog}
    </div>
  )
}

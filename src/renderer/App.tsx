import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useOrchestratorState } from './hooks/useOrchestratorState'
import { useChatState } from './hooks/useChatState'
import { useTickets } from './hooks/useTickets'
import { useIpc } from './hooks/useIpc'
import { useLanguage } from './i18n/LanguageContext'
import { LANGUAGES } from './i18n/translations'
import type { SyncStatus, Ticket, ChatMessage, ProjectAgent } from '@shared/types'
import LoginScreen from './components/LoginScreen'
import NavigationRail from './components/NavigationRail'
import TopBar from './components/TopBar'
import ChatWindow from './components/ChatWindow'
import TicketBoard from './components/TicketBoard'
import ContextPanel from './components/ContextPanel'
import ThreadPanel from './components/ThreadPanel'
import StatusBar from './components/StatusBar'
import ProjectCreateModal from './components/ProjectCreateModal'
import AgentCreateModal from './components/AgentCreateModal'
import AgentPickerModal from './components/AgentPickerModal'
import ProjectSettings from './components/ProjectSettings'
import HomePage from './components/HomePage'
import DocumentsView from './components/DocumentsView'
import GoalsView from './components/GoalsView'
import { useDocuments } from './hooks/useDocuments'

type ModalType = 'none' | 'create-project' | 'pick-agent' | 'create-agent' | 'edit-agent'
type Section = 'home' | 'chat' | 'goals' | 'tickets' | 'documents' | 'project-settings' | 'settings'

export default function App() {
  const { state, loading, error, connect, disconnect } = useOrchestratorState()
  const chat = useChatState()
  const ticketState = useTickets(chat.activeProjectId)
  const docState = useDocuments(chat.activeProjectId)
  const ipc = useIpc()
  const { t } = useLanguage()

  const [modal, setModal] = useState<ModalType>('none')
  const [editingAgent, setEditingAgent] = useState<ProjectAgent | null>(null)
  const [activeSection, setActiveSection] = useState<Section>('home')
  const [contextOpen, setContextOpen] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [activeThread, setActiveThread] = useState<{ parent: ChatMessage; replyIds: string[] } | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ isOnline: false, isSyncing: false, unsyncedCount: 0, lastSyncAt: null })

  // Sync status polling
  useEffect(() => {
    ipc.getSyncStatus().then(setSyncStatus).catch(() => {})
    const unsub = ipc.onSyncStatusUpdate(() => {
      ipc.getSyncStatus().then(setSyncStatus).catch(() => {})
    })
    const interval = setInterval(() => {
      ipc.getSyncStatus().then(setSyncStatus).catch(() => {})
    }, 15000)
    return () => { unsub(); clearInterval(interval) }
  }, [])

  // Keyboard shortcut for context panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setContextOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Clear selected ticket and thread when switching sections or projects
  useEffect(() => {
    setSelectedTicket(null)
    setActiveThread(null)
  }, [activeSection, chat.activeProjectId])

  // Keep selectedTicket in sync with ticket store updates (e.g. new comments from agents)
  useEffect(() => {
    if (!selectedTicket) return
    const allTickets = [...ticketState.tickets.open, ...ticketState.tickets.in_progress, ...ticketState.tickets.done]
    const updated = allTickets.find((t) => t.id === selectedTicket.id)
    if (updated && updated !== selectedTicket) {
      setSelectedTicket(updated)
    }
  }, [ticketState.tickets])

  if (loading || chat.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-dark">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-txt-secondary text-sm">{t('app.initializing')}</span>
        </motion.div>
      </div>
    )
  }

  const isLoggedIn = !!state.userToken

  if (!isLoggedIn) {
    return <LoginScreen onConnect={connect} error={error} />
  }

  const handleCreateTicket = async (title: string, description?: string, assignedAgentLocalId?: string, assignedAgentName?: string, category?: import('@shared/types').TicketCategory, attachments?: import('@shared/types').MessageAttachment[]) => {
    if (!chat.activeProjectId) return undefined
    return await ticketState.createTicket(title, description, assignedAgentLocalId, assignedAgentName, category, attachments)
  }

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setActiveThread(null)
    if (!contextOpen) setContextOpen(true)
  }

  // "Los" button: start work on a ticket through its assigned agent.
  // Triggers the agent by sending a chat message that mentions it with the ticket
  // as task — this reuses the normal agent execution pipeline.
  const handleStartWork = async (ticket: Ticket) => {
    if (!chat.activeProject) return
    const agent = ticket.assignedAgentLocalId
      ? chat.activeProject.agents.find((a) => a.id === ticket.assignedAgentLocalId)
      : null
    if (!agent) return

    // Move the ticket into "In Bearbeitung" so the board reflects the running work.
    if (ticket.status === 'open') {
      await ticketState.updateTicket(ticket.id, { status: 'in_progress' })
    }

    // Switch to chat so the user can follow the agent working.
    setActiveSection('chat')

    const message = `${agent.mentionKey} Starte mit der Arbeit an Ticket #${ticket.ticketNumber}, Arbeite die Aufgabe vollständig ab.`

    await chat.sendMessage(message)
  }

  const handleOpenThread = (parent: ChatMessage, replies: ChatMessage[]) => {
    setActiveThread({ parent, replyIds: replies.map((r) => r.id) })
    setSelectedTicket(null)
  }

  // Resolve live thread replies from messages (transitive: follow replyToLocalId chain)
  const threadReplies = (() => {
    if (!activeThread) return []
    const parentId = activeThread.parent.id
    const threadMsgIds = new Set<string>([parentId])
    // Multiple passes to catch chains
    const msgs = chat.messages
    for (let pass = 0; pass < 3; pass++) {
      for (const m of msgs) {
        if (m.id === parentId) continue
        if (m.replyToLocalId && threadMsgIds.has(m.replyToLocalId)) {
          threadMsgIds.add(m.id)
        }
        if (activeThread.replyIds.includes(m.id)) {
          threadMsgIds.add(m.id)
        }
      }
    }
    threadMsgIds.delete(parentId)
    return msgs.filter((m) => threadMsgIds.has(m.id))
  })()

  return (
    <div className="h-screen flex bg-surface-dark overflow-hidden">
      {/* Navigation Rail (56px) */}
      <NavigationRail
        projects={chat.projects}
        activeProjectId={chat.activeProjectId}
        activeSection={activeSection}
        onSelectProject={(id) => {
          chat.setActiveProjectId(id)
          if (activeSection === 'home' || activeSection === 'settings') {
            setActiveSection('chat')
          }
        }}
        onSelectSection={setActiveSection}
        onCreateProject={() => setModal('create-project')}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <TopBar
          project={chat.activeProject}
          syncStatus={syncStatus}
          onDisconnect={disconnect}
          onTriggerSync={() => ipc.triggerFullSync()}
          onToggleContext={() => setContextOpen((v) => !v)}
          contextOpen={contextOpen}
        />

        {/* Content + Context Panel */}
        <div className="flex-1 flex min-h-0">
          {/* Main content */}
          <AnimatePresence mode="wait" initial={false}>
            {activeSection === 'home' ? (
              <motion.div
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex min-h-0 min-w-0"
              >
                <HomePage
                  projects={chat.projects}
                  onSelectProject={(id) => {
                    chat.setActiveProjectId(id)
                    setActiveSection('chat')
                  }}
                  onCreateProject={() => setModal('create-project')}
                />
              </motion.div>
            ) : activeSection === 'settings' ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto bg-surface-dark p-6"
              >
                <SettingsView
                  state={state}
                  syncStatus={syncStatus}
                  onDisconnect={disconnect}
                  onTriggerSync={() => ipc.triggerFullSync()}
                />
              </motion.div>
            ) : activeSection === 'goals' && chat.activeProject ? (
              <motion.div
                key="goals"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto bg-surface-dark p-6"
              >
                <GoalsView projectId={chat.activeProjectId!} />
              </motion.div>
            ) : activeSection === 'chat' && chat.activeProject ? (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex flex-col min-h-0 min-w-0"
              >
                {/* Chat */}
                <div className="flex-1 flex min-h-0 min-w-0">
                  <ChatWindow
                    projectName={chat.activeProject.name}
                    messages={chat.messages}
                    agents={chat.activeProject.agents}
                    onSendMessage={(content, attachments) => chat.sendMessage(content, undefined, attachments)}
                    onDeleteMessage={chat.deleteMessage}
                    onRetryMessage={chat.retryMessage}
                    onStopAgent={chat.stopAgent}
                    onOpenThread={handleOpenThread}
                  />
                </div>
              </motion.div>
            ) : activeSection === 'tickets' && chat.activeProject ? (
              <motion.div
                key="tickets"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex min-h-0 min-w-0"
              >
                <TicketBoard
                  tickets={ticketState.tickets}
                  agents={chat.activeProject.agents}
                  projectName={chat.activeProject.name}
                  onCreateTicket={handleCreateTicket}
                  onSelectTicket={handleSelectTicket}
                  onStartWork={handleStartWork}
                  onUpdateTicket={ticketState.updateTicket}
                  onDeleteTickets={ticketState.deleteTickets}
                  onImportTickets={ticketState.importTickets}
                  onStartVorhaben={ticketState.startVorhaben}
                />
              </motion.div>
            ) : activeSection === 'documents' && chat.activeProject ? (
              <motion.div
                key="documents"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex min-h-0 min-w-0"
              >
                <DocumentsView
                  documents={docState.documents}
                  onCreateDocument={docState.createDocument}
                  onUpdateDocument={docState.updateDocument}
                  onDeleteDocument={docState.deleteDocument}
                />
              </motion.div>
            ) : activeSection === 'project-settings' && chat.activeProject ? (
              <motion.div
                key="project-settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto bg-surface-dark"
              >
                <ProjectSettings
                  project={chat.activeProject}
                  onUpdateProject={chat.updateProject}
                  onDeleteProject={chat.deleteProject}
                />
              </motion.div>
            ) : (
              <motion.div
                key="no-project"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                  <p className="text-txt-secondary text-sm mb-2">{t('app.noProjectSelected')}</p>
                  <button
                    onClick={() => setModal('create-project')}
                    className="text-sm text-accent hover:text-accent-dark transition-colors"
                  >
                    {t('app.createProject')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Panel: Thread or Context */}
          <AnimatePresence>
            {activeThread && chat.activeProject && (
              <ThreadPanel
                key="thread"
                parentMessage={activeThread.parent}
                replies={threadReplies}
                agents={chat.activeProject.agents}
                onClose={() => setActiveThread(null)}
                onDeleteMessage={chat.deleteMessage}
                onRetryMessage={chat.retryMessage}
                onSendMessage={chat.sendMessage}
              />
            )}
            {!activeThread && contextOpen && chat.activeProject && (
              <ContextPanel
                key="context"
                agents={chat.activeProject.agents}
                onAddAgent={() => setModal('pick-agent')}
                onEditAgent={(agent) => { setEditingAgent(agent); setModal('edit-agent') }}
                onRemoveAgent={chat.removeAgent}
                onSetAgentStopped={chat.setAgentStopped}
                selectedTicket={selectedTicket}
                onCloseTicket={() => setSelectedTicket(null)}
                onUpdateTicket={ticketState.updateTicket}
                onDeleteTicket={ticketState.deleteTicket}
                onAddComment={ticketState.addComment}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Status Bar */}
        {chat.activeProject && (
          <StatusBar
            agents={chat.activeProject.agents}
            tickets={ticketState.tickets}
            messageCount={chat.messages.length}
            documentCount={docState.documents.length}
          />
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal === 'create-project' && (
          <ProjectCreateModal
            onClose={() => setModal('none')}
            onCreate={async (name, description) => {
              await chat.createProject(name, description)
              setModal('none')
            }}
          />
        )}
        {modal === 'pick-agent' && chat.activeProject && (
          <AgentPickerModal
            projectAgents={chat.activeProject.agents}
            onClose={() => setModal('none')}
            onSelectGlobal={async (globalAgentId) => {
              await chat.addGlobalAgentToProject(globalAgentId)
              setModal('none')
            }}
            onCreateNew={() => setModal('create-agent')}
          />
        )}
        {modal === 'create-agent' && (
          <AgentCreateModal
            onClose={() => setModal('none')}
            onCreate={async (data) => {
              await chat.addAgent(data)
              setModal('none')
            }}
          />
        )}
        {modal === 'edit-agent' && editingAgent && (
          <AgentCreateModal
            onClose={() => { setModal('none'); setEditingAgent(null) }}
            editAgent={{
              id: editingAgent.globalAgentId ?? editingAgent.id,
              name: editingAgent.name,
              title: editingAgent.title,
              mentionKey: editingAgent.mentionKey,
              systemPrompt: editingAgent.systemPrompt,
              color: editingAgent.color,
              avatar: editingAgent.avatar,
              model: editingAgent.model,
              effort: editingAgent.effort,
              createdAt: '',
              updatedAt: '',
            }}
            onCreate={() => {}}
            onUpdate={async (globalId, data) => {
              await ipc.updateGlobalAgent(globalId, {
                name: data.name,
                title: data.title,
                mentionKey: '@' + data.name.toLowerCase().replace(/\s+/g, ''),
                systemPrompt: data.systemPrompt,
                color: data.color,
                avatar: data.avatar,
                model: data.model,
                effort: data.effort,
              })
              await chat.reloadProjects()
              setModal('none')
              setEditingAgent(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Simple settings/dashboard view embedded in the main layout
function SettingsView({ state, syncStatus, onDisconnect, onTriggerSync }: {
  state: { userEmail: string | null; planName: string | null; backendUrl: string | null; version: string }
  syncStatus: SyncStatus
  onDisconnect: () => void
  onTriggerSync: () => void
}) {
  const { t, lang, setLang } = useLanguage()

  return (
    <div className="max-w-[560px] mx-auto w-full space-y-4">
      <h2 className="text-xl font-bold text-txt-primary mb-2">{t('settings.title')}</h2>

      {/* Language */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
        <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wider">{t('settings.language')}</h3>
        <div className="flex gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              onClick={() => setLang(l.value)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                lang === l.value
                  ? 'bg-accent-muted text-accent ring-1 ring-accent/30'
                  : 'bg-surface-light text-txt-secondary hover:text-txt-primary hover:bg-surface-light/80'
              }`}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
        <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wider">{t('settings.account')}</h3>
        <div className="flex justify-between text-sm">
          <span className="text-txt-secondary">{t('settings.email')}</span>
          <span className="text-txt-primary">{state.userEmail ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-txt-secondary">{t('settings.plan')}</span>
          <span className="text-txt-primary">{state.planName ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-txt-secondary">{t('settings.backend')}</span>
          <span className="text-txt-primary text-xs font-mono truncate ml-4">{state.backendUrl ?? '—'}</span>
        </div>
      </div>

      {/* Sync */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
        <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wider">{t('settings.sync')}</h3>
        <div className="flex justify-between text-sm">
          <span className="text-txt-secondary">{t('settings.status')}</span>
          <span className={syncStatus.isOnline ? 'text-status-success' : 'text-txt-muted'}>
            {syncStatus.isOnline ? t('common.online') : t('common.offline')}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-txt-secondary">{t('settings.unsynced')}</span>
          <span className="text-txt-primary">{syncStatus.unsyncedCount}</span>
        </div>
        <button
          onClick={onTriggerSync}
          className="w-full py-2 rounded-xl bg-accent-muted text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          {t('settings.syncNow')}
        </button>
      </div>

      {/* Version + Disconnect */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-txt-secondary">{t('settings.version')}</span>
          <span className="text-txt-primary">{state.version}</span>
        </div>
        <button
          onClick={onDisconnect}
          className="w-full py-2 rounded-xl bg-status-error/10 text-status-error text-sm font-medium hover:bg-status-error/20 transition-colors"
        >
          {t('settings.disconnectBtn')}
        </button>
      </div>
    </div>
  )
}

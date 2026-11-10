import { useEffect, type ReactNode } from 'react'
import { AgentsView } from './features/agents/AgentsView'
import { ChatView } from './features/chat/ChatView'
import { DocumentsView } from './features/documents/DocumentsView'
import { GoalsView } from './features/goals/GoalsView'
import { HomeView } from './features/home/HomeView'
import { LogBar } from './features/logs/LogBar'
import { RunsView } from './features/runs/RunsView'
import { SettingsView } from './features/settings/SettingsView'
import { TicketsView } from './features/tickets/TicketsView'
import { NavigationRail } from './layout/NavigationRail'
import { TopBar } from './layout/TopBar'
import { useActivityStore } from './store/activityStore'
import { useClaudeStore } from './store/claudeStore'
import { useProjectStore } from './store/projectStore'
import { useRunStore } from './store/runStore'
import { useUiStore, type Section } from './store/uiStore'

const VIEWS: Record<Section, () => ReactNode> = {
  home: HomeView,
  chat: ChatView,
  tickets: TicketsView,
  documents: DocumentsView,
  goals: GoalsView,
  runs: RunsView,
  agents: AgentsView,
  settings: SettingsView,
}

export function App() {
  const activeSection = useUiStore((state) => state.activeSection)
  const logBarOpen = useUiStore((state) => state.logBarOpen)
  const toggleLogBar = useUiStore((state) => state.toggleLogBar)
  const loadProjects = useProjectStore((state) => state.load)
  const loadClaudeStatus = useClaudeStore((state) => state.load)
  const setClaudeStatus = useClaudeStore((state) => state.set)
  const subscribeActivity = useActivityStore((state) => state.subscribe)
  const loadRuns = useRunStore((state) => state.load)
  const subscribeRuns = useRunStore((state) => state.subscribe)

  useEffect(() => {
    void loadProjects()
    void loadClaudeStatus()
    const offStatus = window.api.on('claude.status', setClaudeStatus)
    // Die Projektliste braucht den Agentenstatus aller Projekte, nicht nur des offenen.
    const offActivity = subscribeActivity()
    // Die Live-Übersicht hört von Anfang an mit: so ist sie beim Öffnen vollständig und muss
    // nicht erst nachladen, was in der Zwischenzeit gelaufen ist.
    const offRuns = subscribeRuns()
    void loadRuns()
    return () => {
      offStatus()
      offActivity()
      offRuns()
    }
  }, [
    loadProjects,
    loadClaudeStatus,
    setClaudeStatus,
    subscribeActivity,
    loadRuns,
    subscribeRuns,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        toggleLogBar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleLogBar])

  const View = VIEWS[activeSection]

  return (
    <div className="flex h-full w-full">
      <NavigationRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto bg-canvas">
            <View />
          </main>
        </div>
        {logBarOpen && <LogBar />}
      </div>
    </div>
  )
}

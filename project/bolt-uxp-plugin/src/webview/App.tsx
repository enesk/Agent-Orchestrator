import { useAppStore } from './store/useAppStore';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { SequenceList } from './components/SequenceList';
import { ClipView } from './components/ClipView';
import { SyncTab } from './components/SyncTab';
import { Footer } from './components/Footer';

export function App() {
  const view = useAppStore((state) => state.view);

  return (
    <div className="app">
      <Header />
      <Toolbar />
      <main className="app-content">
        {view === 'sequences' && <SequenceList />}
        {view === 'clips' && <ClipView />}
      </main>
      <SyncTab />
      <Footer />
    </div>
  );
}

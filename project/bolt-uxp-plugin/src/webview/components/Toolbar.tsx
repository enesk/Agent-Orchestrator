import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getSequences } from '../bridge';
import './Toolbar.css';

export function Toolbar() {
  const sequences = useAppStore((s) => s.sequences);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const syncTabOpen = useAppStore((s) => s.syncTabOpen);
  const setSequences = useAppStore((s) => s.setSequences);
  const setView = useAppStore((s) => s.setView);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setSyncTabOpen = useAppStore((s) => s.setSyncTabOpen);
  const setStatusBadge = useAppStore((s) => s.setStatusBadge);
  const setFooterText = useAppStore((s) => s.setFooterText);

  const handleLoad = useCallback(async () => {
    try {
      setStatusBadge('loading');
      setFooterText('Lade Sequenzen...');
      const result = await getSequences();
      setSequences(result ?? []);
      setView('sequences');
    } catch (err) {
      setStatusBadge('error');
      setFooterText(
        `Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
      );
    }
  }, [setSequences, setView, setStatusBadge, setFooterText]);

  const handleSyncToggle = useCallback(() => {
    setSyncTabOpen(!syncTabOpen);
  }, [syncTabOpen, setSyncTabOpen]);

  const showSearch = sequences.length > 3;

  return (
    <div className="toolbar">
      <button
        className="toolbar-btn toolbar-btn-load"
        onClick={handleLoad}
        title="Sequenzen laden"
      >
        <span className="icon-refresh" aria-hidden="true" />
        <span className="toolbar-btn-text">Laden</span>
      </button>

      {showSearch && (
        <div className="toolbar-search-wrapper">
          <span className="icon-search toolbar-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="toolbar-search"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <button
        className="toolbar-btn toolbar-btn-sync"
        onClick={handleSyncToggle}
        title={syncTabOpen ? 'Sync-Tab schließen' : 'Sync-Tab öffnen'}
        data-active={syncTabOpen || undefined}
      >
        <span className="icon-sync" aria-hidden="true" />
      </button>
    </div>
  );
}

import { useAppStore, type Sequence } from '../store/useAppStore';
import { getClipsFromSequence } from '../bridge';
import { log } from '../../shared/logger';
import './SequenceList.css';

export function SequenceList() {
  const sequences = useAppStore((s) => s.sequences);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSelectedSequence = useAppStore((s) => s.setSelectedSequence);
  const setClips = useAppStore((s) => s.setClips);
  const setView = useAppStore((s) => s.setView);
  const setStatusBadge = useAppStore((s) => s.setStatusBadge);
  const setFooterText = useAppStore((s) => s.setFooterText);

  // Suchfilter anwenden
  const filtered = searchQuery
    ? sequences.filter((seq) =>
        seq.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sequences;

  const handleSelectSequence = async (sequence: Sequence) => {
    try {
      setStatusBadge('loading');
      setFooterText(`Lade Clips aus "${sequence.name}"...`);
      setSelectedSequence(sequence);

      const clips = await getClipsFromSequence(sequence.id);
      setClips(clips ?? []);
      setView('clips');
      setStatusBadge('success');
      setFooterText(`${(clips ?? []).length} Clips geladen`);
      log('SequenceList', 'Clips geladen:', (clips ?? []).length);
    } catch (err) {
      setStatusBadge('error');
      setFooterText(
        `Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
      );
      log.error('SequenceList', 'Fehler beim Laden der Clips:', err);
    }
  };

  // Leerer Zustand: Keine Sequenzen geladen (kein Projekt oder leer)
  if (sequences.length === 0) {
    return (
      <div className="sequence-list">
        <div className="empty-state">
          <span className="empty-state-icon">
            <span className="icon icon-folder" aria-hidden="true" />
          </span>
          <span className="empty-state-text">Kein Projekt geoeffnet</span>
          <span className="empty-state-hint">
            Oeffne ein Projekt und klicke auf "Laden"
          </span>
        </div>
      </div>
    );
  }

  // Leerer Zustand: Keine Sequenzen im Projekt
  if (filtered.length === 0 && !searchQuery) {
    return (
      <div className="sequence-list">
        <div className="empty-state">
          <span className="empty-state-icon">
            <span className="icon icon-film" aria-hidden="true" />
          </span>
          <span className="empty-state-text">Keine Sequenzen gefunden</span>
          <span className="empty-state-hint">
            Dieses Projekt enthaelt keine Sequenzen
          </span>
        </div>
      </div>
    );
  }

  // Leerer Zustand: Suche ohne Treffer
  if (filtered.length === 0 && searchQuery) {
    return (
      <div className="sequence-list">
        <div className="empty-state">
          <span className="empty-state-icon">
            <span className="icon icon-search" aria-hidden="true" />
          </span>
          <span className="empty-state-text">Keine Treffer</span>
          <span className="empty-state-hint">
            Keine Sequenzen fuer "{searchQuery}" gefunden
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="sequence-list">
      {/* Ergebnis-Leiste */}
      <div className="sequence-list-result-bar">
        <span className="icon icon-film" aria-hidden="true" />
        <span>
          {filtered.length}{' '}
          {filtered.length === 1 ? 'Sequenz' : 'Sequenzen'} gefunden
        </span>
      </div>

      {/* Sequenz-Cards */}
      {filtered.map((seq, index) => (
        <div
          key={seq.id}
          className="card card-animate sequence-card"
          onClick={() => handleSelectSequence(seq)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSelectSequence(seq);
            }
          }}
        >
          <div className="sequence-card-icon">
            <span className="icon icon-film" aria-hidden="true" />
          </div>

          <div className="sequence-card-info">
            <div className="sequence-card-name">{seq.name}</div>
            <div className="sequence-card-meta">
              Sequenz {index + 1} von {filtered.length}
            </div>
          </div>

          <span className="number-badge">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}

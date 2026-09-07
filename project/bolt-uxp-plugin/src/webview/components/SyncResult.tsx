import { useAppStore } from '../store/useAppStore';
import './SyncResult.css';

export function SyncResult() {
  const syncStatus = useAppStore((s) => s.syncStatus);
  const syncResult = useAppStore((s) => s.syncResult);

  if (syncStatus === 'idle') return null;

  // Loading
  if (syncStatus === 'loading') {
    return (
      <div className="sync-result-loading">
        <div className="spinner" />
        <span className="sync-result-loading-text">Analysiere Audio...</span>
      </div>
    );
  }

  // Fehler
  if (syncStatus === 'error') {
    return (
      <div className="sync-result-error">
        <span className="sync-result-icon icon-close" />
        <span className="sync-result-message">
          {syncResult?.error || 'Unbekannter Fehler'}
        </span>
      </div>
    );
  }

  // Teilweise (Offset berechnet, aber Clip nicht verschoben)
  if (syncStatus === 'partial') {
    const offset = syncResult?.offset ?? 0;
    return (
      <div className="sync-result-partial">
        <span className="sync-result-icon icon-info" />
        <div className="sync-result-body">
          <span className="sync-result-message">
            Offset berechnet ({formatOffset(offset)}), aber Clip konnte nicht verschoben werden.
          </span>
          {syncResult?.message && (
            <span className="sync-result-detail">{syncResult.message}</span>
          )}
        </div>
      </div>
    );
  }

  // Erfolg
  if (syncStatus === 'success' && syncResult) {
    const { offset, confidence } = syncResult;
    return (
      <div className="sync-result-success">
        <span className="sync-result-icon icon-check" />
        <div className="sync-result-body">
          <span className="sync-result-offset">{formatOffset(offset)}</span>
          <span className="sync-result-confidence">
            Konfidenz: {Math.round(confidence * 100)}%
          </span>
        </div>
      </div>
    );
  }

  return null;
}

function formatOffset(offset: number): string {
  if (offset === 0) return 'Kein Versatz';
  const abs = Math.abs(offset).toFixed(3);
  if (offset < 0) return `\u2190 ${abs}s nach links`;
  return `\u2192 ${abs}s nach rechts`;
}

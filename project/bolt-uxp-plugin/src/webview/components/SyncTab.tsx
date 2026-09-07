import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { syncFetch } from '../utils/syncFetch';
import { log } from '../../shared/logger';
import { SyncResult } from './SyncResult';
import './SyncTab.css';

export function SyncTab() {
  const syncTabOpen = useAppStore((s) => s.syncTabOpen);
  const serverStatus = useAppStore((s) => s.serverStatus);
  const referenceClip = useAppStore((s) => s.referenceClip);
  const targetClip = useAppStore((s) => s.targetClip);
  const setServerStatus = useAppStore((s) => s.setServerStatus);
  const setFooterText = useAppStore((s) => s.setFooterText);

  const checkHealth = useCallback(async () => {
    setServerStatus('checking');
    try {
      const res = await syncFetch('/health');
      if (res.ok) {
        setServerStatus('online');
        setFooterText('Server verbunden');
        log('Sync', 'Health-Check: online');
      } else {
        setServerStatus('offline');
        setFooterText('Server nicht erreichbar');
        log.warn('Sync', 'Health-Check: Status', res.status);
      }
    } catch {
      setServerStatus('offline');
      setFooterText('Server nicht erreichbar');
      log.warn('Sync', 'Health-Check fehlgeschlagen');
    }
  }, [setServerStatus, setFooterText]);

  // Health-Check bei Tab-Oeffnung
  useEffect(() => {
    if (syncTabOpen) {
      checkHealth();
    }
  }, [syncTabOpen, checkHealth]);

  if (!syncTabOpen) return null;

  const canSync = referenceClip !== null && targetClip !== null;

  const handleSyncStart = () => {
    if (!canSync) return;
    // Sync-Logik wird in #12 implementiert
    log('Sync', 'Sync gestartet:', referenceClip!.name, '->', targetClip!.name);
  };

  return (
    <aside className="sync-tab">
      {/* Server-Status */}
      <div className="sync-section">
        <div className="sync-server-status">
          <div className="sync-server-row">
            <span className={`status-dot status-dot--${serverStatus}`} />
            <span className="sync-server-label">
              {serverStatus === 'online' && 'Verbunden'}
              {serverStatus === 'offline' && 'Nicht erreichbar'}
              {serverStatus === 'checking' && 'Pruefe...'}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={checkHealth}
            disabled={serverStatus === 'checking'}
          >
            Pruefen
          </button>
        </div>
      </div>

      {/* Anleitung */}
      <div className="sync-section">
        <h3 className="section-heading">Anleitung</h3>
        <ol className="sync-steps">
          <li>
            <span className="sync-step-num">1</span>
            <span>Referenz-Clip waehlen (1. Klick)</span>
          </li>
          <li>
            <span className="sync-step-num">2</span>
            <span>Ziel-Clip waehlen (2. Klick)</span>
          </li>
          <li>
            <span className="sync-step-num">3</span>
            <span>Sync starten</span>
          </li>
        </ol>
      </div>

      {/* Sync-Slots */}
      <div className="sync-section">
        <h3 className="section-heading">Auswahl</h3>
        <div className="sync-slots">
          <div className={`sync-slot ${referenceClip ? 'sync-slot--ref' : 'sync-slot--empty'}`}>
            <span className="badge badge-indigo">REF</span>
            <span className="sync-slot-name">
              {referenceClip ? referenceClip.name : 'Nicht gewaehlt'}
            </span>
          </div>

          <div className="sync-slots-arrow">
            <span className="icon-arrow-right" />
          </div>

          <div className={`sync-slot ${targetClip ? 'sync-slot--target' : 'sync-slot--empty'}`}>
            <span className="badge badge-purple">ZIEL</span>
            <span className="sync-slot-name">
              {targetClip ? targetClip.name : 'Nicht gewaehlt'}
            </span>
          </div>
        </div>
      </div>

      {/* Sync-Ergebnis */}
      <div className="sync-section">
        <SyncResult />
      </div>

      {/* Sync-Button */}
      <div className="sync-section">
        <button
          className="btn btn-primary btn-block"
          disabled={!canSync}
          onClick={handleSyncStart}
        >
          Sync starten
        </button>
      </div>
    </aside>
  );
}

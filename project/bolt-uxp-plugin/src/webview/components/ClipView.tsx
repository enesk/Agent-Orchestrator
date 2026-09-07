import { useCallback, useEffect, useState } from 'react';
import { useAppStore, type Clip, type LinkedClip } from '../store/useAppStore';
import { getClipsFromSequence, getMediaFilePath } from '../bridge';
import { log } from '../../shared/logger';
import './ClipView.css';

/**
 * Gruppiert Clips nach Name: gleicher Name auf Video + Audio → LinkedClip.
 * Ergebnis: linked (beides), videoOnly, audioOnly.
 */
function groupClips(clips: Clip[]): {
  linked: LinkedClip[];
  videoOnly: LinkedClip[];
  audioOnly: LinkedClip[];
} {
  const byName = new Map<string, { video: Clip[]; audio: Clip[] }>();

  for (const clip of clips) {
    const entry = byName.get(clip.name) ?? { video: [], audio: [] };
    if (clip.trackType === 'video') {
      entry.video.push(clip);
    } else {
      entry.audio.push(clip);
    }
    byName.set(clip.name, entry);
  }

  const linked: LinkedClip[] = [];
  const videoOnly: LinkedClip[] = [];
  const audioOnly: LinkedClip[] = [];

  for (const [name, { video, audio }] of byName) {
    const group: LinkedClip = {
      name,
      videoClips: video,
      audioClips: audio,
      mediaPath: video[0]?.mediaPath ?? audio[0]?.mediaPath,
    };

    if (video.length > 0 && audio.length > 0) {
      linked.push(group);
    } else if (video.length > 0) {
      videoOnly.push(group);
    } else {
      audioOnly.push(group);
    }
  }

  return { linked, videoOnly, audioOnly };
}

/**
 * Formatiert Track-Info: z.B. "V1, A1-A2"
 */
function formatTrackInfo(group: LinkedClip): string {
  const parts: string[] = [];

  if (group.videoClips.length > 0) {
    const indices = group.videoClips.map((c) => c.trackIndex).sort((a, b) => a - b);
    if (indices.length === 1) {
      parts.push(`V${indices[0] + 1}`);
    } else {
      parts.push(`V${indices[0] + 1}-V${indices[indices.length - 1] + 1}`);
    }
  }

  if (group.audioClips.length > 0) {
    const indices = group.audioClips.map((c) => c.trackIndex).sort((a, b) => a - b);
    if (indices.length === 1) {
      parts.push(`A${indices[0] + 1}`);
    } else {
      parts.push(`A${indices[0] + 1}-A${indices[indices.length - 1] + 1}`);
    }
  }

  return parts.join(', ');
}

/**
 * Bestimmt den Typ-String für ein Clip-Gruppierung.
 */
function getClipType(group: LinkedClip): 'linked' | 'video' | 'audio' {
  if (group.videoClips.length > 0 && group.audioClips.length > 0) return 'linked';
  if (group.videoClips.length > 0) return 'video';
  return 'audio';
}

export function ClipView() {
  const selectedSequence = useAppStore((s) => s.selectedSequence);
  const setClips = useAppStore((s) => s.setClips);
  const setLinkedClips = useAppStore((s) => s.setLinkedClips);
  const setView = useAppStore((s) => s.setView);
  const setStatusBadge = useAppStore((s) => s.setStatusBadge);
  const setFooterText = useAppStore((s) => s.setFooterText);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedClip[]>([]);
  const [videoOnly, setVideoOnly] = useState<LinkedClip[]>([]);
  const [audioOnly, setAudioOnly] = useState<LinkedClip[]>([]);

  // Clips laden und gruppieren
  useEffect(() => {
    if (!selectedSequence) return;

    let cancelled = false;

    async function loadClips() {
      try {
        setLoading(true);
        setError(null);
        setStatusBadge('loading');
        setFooterText('Lade Clips...');

        const rawClips = await getClipsFromSequence(selectedSequence!.id);

        if (cancelled) return;

        const clips: Clip[] = (rawClips ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          trackIndex: c.trackIndex,
          trackType: c.trackType,
          startTicks: c.startTicks,
          endTicks: c.endTicks,
          mediaPath: c.mediaPath,
        }));

        setClips(clips);

        // Gruppierung
        const groups = groupClips(clips);
        setLinked(groups.linked);
        setVideoOnly(groups.videoOnly);
        setAudioOnly(groups.audioOnly);

        // Alle gruppierten Clips für den Store
        const allLinked = [...groups.linked, ...groups.videoOnly, ...groups.audioOnly];
        setLinkedClips(allLinked);

        // MediaPath für Clips nachladen, die noch keinen haben
        for (const group of allLinked) {
          if (!group.mediaPath) {
            try {
              const result = await getMediaFilePath(selectedSequence!.id, group.name);
              if (result?.path && !cancelled) {
                group.mediaPath = result.path;
              }
            } catch {
              log.warn('ClipView', `MediaPath für "${group.name}" nicht verfügbar`);
            }
          }
        }

        if (!cancelled) {
          setLinkedClips([...allLinked]);
          const totalClips = clips.length;
          setFooterText(`${totalClips} Clips in ${allLinked.length} Gruppen`);
          setStatusBadge('success');
          log('ClipView', `${totalClips} Clips geladen, ${groups.linked.length} verknüpft`);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setError(msg);
        setStatusBadge('error');
        setFooterText(`Fehler: ${msg}`);
        log.error('ClipView', 'Fehler beim Laden:', msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadClips();
    return () => { cancelled = true; };
  }, [selectedSequence, setClips, setLinkedClips, setStatusBadge, setFooterText]);

  const handleBack = useCallback(() => {
    setView('sequences');
    setFooterText(`${useAppStore.getState().sequences.length} Sequenzen geladen`);
  }, [setView, setFooterText]);

  const totalGroups = linked.length + videoOnly.length + audioOnly.length;

  // Loading
  if (loading) {
    return (
      <div className="clip-view">
        <div className="clip-view-header">
          <button className="btn btn-ghost clip-back-btn" onClick={handleBack}>
            <span className="icon icon-arrow-left" aria-hidden="true" />
            <span>Zurück</span>
          </button>
        </div>
        <div className="empty-state">
          <div className="spinner" />
          <p className="empty-state-text">Lade Clips...</p>
        </div>
      </div>
    );
  }

  // Fehler
  if (error) {
    return (
      <div className="clip-view">
        <div className="clip-view-header">
          <button className="btn btn-ghost clip-back-btn" onClick={handleBack}>
            <span className="icon icon-arrow-left" aria-hidden="true" />
            <span>Zurück</span>
          </button>
        </div>
        <div className="empty-state">
          <span className="icon icon-close empty-state-icon" aria-hidden="true" />
          <p className="empty-state-text">Fehler beim Laden</p>
          <p className="empty-state-hint">{error}</p>
        </div>
      </div>
    );
  }

  // Keine Clips
  if (totalGroups === 0) {
    return (
      <div className="clip-view">
        <div className="clip-view-header">
          <button className="btn btn-ghost clip-back-btn" onClick={handleBack}>
            <span className="icon icon-arrow-left" aria-hidden="true" />
            <span>Zurück</span>
          </button>
          {selectedSequence && (
            <span className="clip-view-title text-truncate">
              {selectedSequence.name}
            </span>
          )}
        </div>
        <div className="empty-state">
          <span className="icon icon-film empty-state-icon" aria-hidden="true" />
          <p className="empty-state-text">Keine Clips gefunden</p>
          <p className="empty-state-hint">Diese Sequenz enthält keine Clips.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clip-view">
      {/* Header mit Zurück-Button */}
      <div className="clip-view-header">
        <button className="btn btn-ghost clip-back-btn" onClick={handleBack}>
          <span className="icon icon-arrow-left" aria-hidden="true" />
          <span>Zurück</span>
        </button>
        {selectedSequence && (
          <span className="clip-view-title text-truncate">
            {selectedSequence.name}
          </span>
        )}
      </div>

      {/* Ergebnis-Leiste */}
      <div className="result-bar">
        {totalGroups} Clip{totalGroups !== 1 ? 's' : ''} gefunden
      </div>

      {/* Verknüpfte Clips */}
      {linked.length > 0 && (
        <ClipSection
          title="Verknüpfte Clips (Video + Audio)"
          groups={linked}
        />
      )}

      {/* Nur Video */}
      {videoOnly.length > 0 && (
        <ClipSection
          title="Nur Video"
          groups={videoOnly}
        />
      )}

      {/* Nur Audio */}
      {audioOnly.length > 0 && (
        <ClipSection
          title="Nur Audio"
          groups={audioOnly}
        />
      )}
    </div>
  );
}

// ── Clip-Sektion mit Überschrift ──

function ClipSection({ title, groups }: { title: string; groups: LinkedClip[] }) {
  return (
    <div className="clip-section">
      <h3 className="section-heading">{title}</h3>
      <div className="clip-list">
        {groups.map((group, index) => (
          <ClipCard key={group.name} group={group} index={index} />
        ))}
      </div>
    </div>
  );
}

// ── Einzelne Clip-Card ──

function ClipCard({ group, index }: { group: LinkedClip; index: number }) {
  const referenceClip = useAppStore((s) => s.referenceClip);
  const targetClip = useAppStore((s) => s.targetClip);
  const selectClipForSync = useAppStore((s) => s.selectClipForSync);

  const clipType = getClipType(group);
  const trackInfo = formatTrackInfo(group);
  const isRef = referenceClip?.name === group.name;
  const isTarget = targetClip?.name === group.name;

  let cardClass = 'card card-animate clip-card clip-card--selectable';
  if (isRef) cardClass += ' card--ref';
  else if (isTarget) cardClass += ' card--target';

  const handleClick = useCallback(() => {
    selectClipForSync(group);
  }, [selectClipForSync, group]);

  return (
    <div
      className={cardClass}
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
    >
      <div className="clip-card-content">
        {/* Typ-Icon */}
        <span
          className={`icon ${clipType === 'audio' ? 'icon-audio' : 'icon-video'} clip-card-icon`}
          aria-hidden="true"
        />

        {/* Info */}
        <div className="clip-card-info">
          <span className="clip-card-name text-truncate">{group.name}</span>
          <span className="clip-card-track text-meta">{trackInfo}</span>
        </div>

        {/* Badges */}
        <div className="clip-card-badges">
          {isRef && <span className="badge badge-ref">REF</span>}
          {isTarget && <span className="badge badge-target">ZIEL</span>}

          {group.videoClips.length > 0 && (
            <span className="badge badge-track-video">Video</span>
          )}
          {group.audioClips.length > 0 && (
            <span className="badge badge-track-audio">Audio</span>
          )}
        </div>
      </div>
    </div>
  );
}

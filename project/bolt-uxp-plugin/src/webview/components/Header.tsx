import { useAppStore } from '../store/useAppStore';
import type { StatusBadge } from '../store/useAppStore';
import './Header.css';

const badgeLabels: Record<StatusBadge, string> = {
  default: 'Bereit',
  loading: 'Laden…',
  success: 'Erfolg',
  warning: 'Warnung',
  error: 'Fehler',
};

export function Header() {
  const statusBadge = useAppStore((state) => state.statusBadge);

  return (
    <header className="header">
      <div className="header-accent-line" />
      <div className="header-content">
        <div className="header-left">
          <div className="header-icon" aria-hidden="true">
            <div className="header-icon-play" />
          </div>
          <div className="header-text">
            <h1 className="header-title">Sequence Browser</h1>
            <p className="header-subtitle">by Enes Kul · Premiere Pro UXP</p>
          </div>
        </div>
        <div
          className={`header-badge header-badge--${statusBadge}`}
          title={badgeLabels[statusBadge]}
        >
          <span className="header-badge-dot" />
          <span className="header-badge-label">{badgeLabels[statusBadge]}</span>
        </div>
      </div>
    </header>
  );
}

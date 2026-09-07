import { useAppStore } from '../store/useAppStore';
import './Footer.css';

export function Footer() {
  const sequences = useAppStore((state) => state.sequences);
  const footerText = useAppStore((state) => state.footerText);

  const isActive = sequences.length > 0;

  return (
    <footer className="footer">
      <div className="footer-status">
        <span
          className={`footer-dot ${isActive ? 'footer-dot--active' : 'footer-dot--inactive'}`}
          aria-label={isActive ? 'Aktiv' : 'Inaktiv'}
        />
      </div>
      <span className="footer-text">{footerText}</span>
      <span className="footer-version">v1.1.0</span>
    </footer>
  );
}

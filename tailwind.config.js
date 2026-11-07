/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Die Breite, ab der das Mockup auf die weiten Innenabstände wechselt.
      screens: {
        wide: '980px',
      },
      colors: {
        // Flächen — von tief nach hoch gestapelt
        base: '#0b0b0d',
        canvas: '#0f0f11',
        surface: '#17171a',
        raised: '#1e1e22',
        overlay: '#26262b',
        line: '#2e2e34',
        'line-strong': '#3d3d45',
        // Text
        ink: '#e8ecf1',
        'ink-muted': '#9aa5b3',
        'ink-faint': '#6b7583',
        // Akzent
        accent: '#5b8dee',
        'accent-hover': '#7aa3f2',
        'accent-soft': '#1d2a44',
        // Status
        success: '#4ac08a',
        warning: '#e3b341',
        danger: '#e5645f',
        info: '#58a6c9',
        /*
         * Palette des Projektlisten-Mockups. Die Werte selbst stehen als CSS-Variablen in
         * index.css, damit die helle Variante allein am `data-theme` hängt.
         */
        ui: {
          bg: 'var(--bg)',
          panel: 'var(--panel)',
          'panel-2': 'var(--panel-2)',
          line: 'var(--line)',
          'line-2': 'var(--line-2)',
          text: 'var(--text)',
          'text-2': 'var(--text-2)',
          'text-3': 'var(--text-3)',
          accent: 'var(--accent)',
          'accent-soft': 'var(--accent-soft)',
          /* Schrift auf dem Akzentknopf — das Mockup setzt sie fest, nicht über eine Variable. */
          'accent-ink': '#0d1b3d',
          warn: 'var(--warn)',
          ok: 'var(--ok)',
        },
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
      },
      fontFamily: {
        sans: ['Instrument Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}

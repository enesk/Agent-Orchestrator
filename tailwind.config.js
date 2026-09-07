/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Flächen — von tief nach hoch gestapelt
        base: '#0d1013',
        surface: '#14181d',
        raised: '#1b2027',
        overlay: '#232932',
        line: '#2b323c',
        'line-strong': '#3a424f',
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
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}

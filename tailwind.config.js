/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
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

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#FAFBFC',
          light: '#F4F5F7',
          hover: '#EEF0F4',
          active: '#E8EAEF',
        },
        border: {
          DEFAULT: '#E5E7EB',
          light: '#D1D5DB',
          accent: '#A5B4FC',
        },
        accent: {
          DEFAULT: '#6366F1',
          light: '#EEF2FF',
          dark: '#4F46E5',
          muted: '#C7D2FE',
          text: '#4338CA',
        },
        accent2: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
          dark: '#D97706',
        },
        txt: {
          primary: '#111827',
          body: '#374151',
          secondary: '#6B7280',
          muted: '#9CA3AF',
        },
        status: {
          success: '#10B981',
          'success-bg': '#ECFDF5',
          error: '#EF4444',
          'error-bg': '#FEF2F2',
          warning: '#F59E0B',
          'warning-bg': '#FFFBEB',
          info: '#3B82F6',
          'info-bg': '#EFF6FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs': ['13px', { lineHeight: '1.5', letterSpacing: '0' }],
        'sm': ['14px', { lineHeight: '1.6', letterSpacing: '0' }],
        'base': ['16px', { lineHeight: '1.65', letterSpacing: '0' }],
        'lg': ['18px', { lineHeight: '1.5', letterSpacing: '0' }],
        'xl': ['22px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        '2xl': ['28px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      letterSpacing: {
        tighter: '-0.01em',
      },
      spacing: {
        'xs': '6px',
        'sm-space': '10px',
        'md-space': '16px',
        'lg-space': '24px',
        'xl-space': '36px',
        '2xl-space': '48px',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(0,0,0,0.04)',
        'sm': '0 1px 3px rgba(0,0,0,0.06)',
        'md': '0 4px 12px rgba(0,0,0,0.08)',
        'lg': '0 12px 32px rgba(0,0,0,0.10)',
        'xl': '0 24px 48px rgba(0,0,0,0.12)',
        'focus': '0 0 0 3px rgba(99,102,241,0.15)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}

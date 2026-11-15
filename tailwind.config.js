/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: {
          900: '#08070a',
          850: '#0c0b10',
          800: '#111017',
          750: '#16151d',
          700: '#1c1a24',
          600: '#25222e',
          500: '#322e3d',
        },
        gold: {
          50: '#fbf3d8',
          200: '#f0dfa4',
          300: '#e3c878',
          400: '#d4af4f',
          500: '#b8912f',
          600: '#8f6d20',
          700: '#6b4f16',
        },
        ember: {
          400: '#c46a3b',
          500: '#a8532a',
          600: '#833f20',
        },
        moss: {
          400: '#6f8f5f',
          500: '#557047',
          600: '#3e5434',
        },
        blood: {
          500: '#8c2b32',
          600: '#6b1f25',
        },
        parchment: '#efe3c6',
      },
      fontFamily: {
        display: ['"Cinzel Decorative"', 'serif'],
        serif: ['"Cormorant Garamond"', 'serif'],
        runic: ['"Noto Sans Runic"', 'serif'],
        ui: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px -12px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(212,175,79,0.35), 0 0 18px -4px rgba(212,175,79,0.45)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pulse-slow': 'pulse-slow 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

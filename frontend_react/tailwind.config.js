/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: {
      xs:  '480px',
      sm:  '640px',
      md:  '768px',
      lg:  '1024px',
      xl:  '1280px',
      '2xl': '1536px',
    },
    extend: {
      fontFamily: {
        sans: ["'Inter'", 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e9ff',
          200: '#c7d7fe',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      boxShadow: {
        'glow-sm':     '0 0 12px rgba(99,102,241,0.25)',
        'glow':        '0 0 24px rgba(99,102,241,0.35)',
        'glow-green':  '0 4px 20px rgba(16,185,129,0.35)',
        'glow-cyan':   '0 4px 20px rgba(14,165,233,0.35)',
        'glow-violet': '0 4px 20px rgba(139,92,246,0.35)',
        'glow-amber':  '0 4px 20px rgba(245,158,11,0.35)',
        'card':        '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(99,102,241,0.06)',
        'card-hover':  '0 4px 24px rgba(99,102,241,0.15)',
        'glass':       '0 8px 32px rgba(99,102,241,0.08), 0 1px 0 rgba(255,255,255,0.8) inset',
      },
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #9333ea 100%)',
        'gradient-emerald': 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
        'gradient-sky':     'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
        'gradient-violet':  'linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)',
        'gradient-amber':   'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
        'gradient-rose':    'linear-gradient(135deg, #be123c 0%, #f43f5e 100%)',
        'gradient-mesh':    'linear-gradient(160deg, #f5f3ff 0%, #ede9fe 30%, #fdf4ff 70%, #f0f9ff 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

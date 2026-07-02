/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        arabic: ['Tajawal', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        navy: {
          50: '#eef1f7', 100: '#d7deec', 200: '#b0bcd9', 300: '#8899c1',
          400: '#5c72a3', 500: '#3d5286', 600: '#2a3c68', 700: '#1f2d4e',
          800: '#161f38', 900: '#0d1424', 950: '#080d18',
        },
        gold: {
          50: '#fbf6e9', 100: '#f5e8c2', 200: '#eed699', 300: '#e6c26e',
          400: '#dfb24d', 500: '#c9a227', 600: '#a9841d', 700: '#856615',
          800: '#61490e', 900: '#3f2f08',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(13, 20, 36, 0.06), 0 1px 3px 0 rgba(13, 20, 36, 0.08)',
        'card-hover': '0 4px 12px -2px rgba(13, 20, 36, 0.12), 0 2px 6px -2px rgba(13, 20, 36, 0.08)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'slide-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

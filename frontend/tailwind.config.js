/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0C0E12',
        surface: {
          DEFAULT: '#14161C',
          hover: '#1A1D25',
        },
        border: {
          DEFAULT: '#23262F',
          hover: '#2E323D',
        },
        accent: {
          DEFAULT: '#6366F1',
          hover: '#818CF8',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        text: {
          primary: '#F1F1F3',
          secondary: '#8B8D97',
          tertiary: '#5A5C66',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          900: '#070b13',
          850: '#0b1120',
          800: '#0f172a',
          700: '#1e293b',
          600: '#334155',
        },
        anatomy: {
          bone: '#e2e8f0',
          muscle: '#ef4444',
          nerve: '#38bdf8',
          accent: '#06b6d4',
          highlight: '#38bdf8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      }
    },
  },
  plugins: [],
}

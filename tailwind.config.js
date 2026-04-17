/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'dnd-red': '#e53e3e',
        'dnd-blue': '#3182ce',
        'dnd-green': '#38a169',
        'dnd-purple': '#805ad5',
        'dnd-yellow': '#d69e2e',
        'dnd-orange': '#dd6b20',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}

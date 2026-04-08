module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        suki: {
          bg: '#0d0d0f',
          surface: '#141418',
          elevated: '#1a1a20',
          border: '#2a2a33',
          accent: '#00ffe7',
          text: '#e8e8ec',
          muted: '#8a8a96',
          success: '#3dd68c',
          warning: '#f0b429',
          error: '#ef4444',
        }
      }
    }
  },
  plugins: []
};

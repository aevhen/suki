module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        suki: {
          bg: '#0a0812',
          surface: '#110f1e',
          elevated: '#1a1730',
          border: '#2d2850',
          'border-bright': '#4a4480',
          accent: '#7c6ee0',
          'accent-dim': '#5548b0',
          'accent-bright': '#a394f0',
          text: '#e8e4ff',
          muted: '#9890c0',
          dim: '#5a5480',
          success: '#3dd68c',
          warning: '#f0b429',
          error: '#e05c5c',
          info: '#60a8e0',
          p0: '#e05c5c',
          p1: '#f0b429',
          p2: '#60a8e0',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      }
    }
  },
  plugins: []
};

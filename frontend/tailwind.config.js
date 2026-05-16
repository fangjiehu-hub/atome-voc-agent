/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f1f5',
          100: '#e0e3ec',
          300: '#8b95b0',
          500: '#141c30',
          600: '#0d1220',
          700: '#080c18',
        },
        accent: '#f0ff5f',
        coral: '#ff5844',
        beige: '#e6e6de',
        sev: {
          s0: '#9CA3AF',
          s1: '#10B981',
          s2: '#F59E0B',
          s3: '#F97316',
          s4: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        md: '0 4px 12px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
    },
  },
  plugins: [],
};

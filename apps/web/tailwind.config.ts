import type { Config } from 'tailwindcss';

// Colours come from CSS variables so a screen can switch between the bright back-office and the dark counter (.counter).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)', paper: 'var(--paper)', line: 'var(--line)', ink: 'var(--ink)', muted: 'var(--muted)',
        gold: 'var(--gold)', 'gold-deep': 'var(--gold-deep)', 'gold-wash': 'var(--gold-wash)',
        ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)',
      },
      fontFamily: { sans: ['"Noto Sans Variable"', 'system-ui', 'sans-serif'], display: ['"Playfair Display"', 'Georgia', 'serif'] },
      borderRadius: { DEFAULT: '6px', lg: '10px' },
    },
  },
  plugins: [],
} satisfies Config;

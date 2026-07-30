import type { Config } from 'tailwindcss';

/**
 * Tokens taken verbatim from the rescue-kit mockup spec (CLAUDE.md §9).
 * Fonts: Fraunces (display, italic for accents) + Hanken Grotesk (body).
 * Palette: cream/forest/sage/clay/amber/sky.
 *
 * Do not invent new colors here — match the mockup.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Hanken Grotesk Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        cream:       '#FAF5EC',
        paper:       '#FFFFFF',
        ink:         '#1C2A21',
        muted:       '#6E7C70',
        forest:      '#2C5A3B',
        'forest-deep': '#1E3F29',
        sage:        '#E5EEE2',
        'sage-line': '#CFE0CC',
        clay:        '#D27A4C',
        'clay-soft': '#F7E4D6',
        amber:       '#E5A93F',
        'amber-soft':'#FBEBC8',
        sky:         '#3E6F8E',
        'sky-soft':  '#DCE9F0',
        line:        '#EAE3D4',
        'line-2':    '#E0D8C6',
      },
      boxShadow: {
        soft:  '0 6px 18px -10px rgba(28,42,33,.32)',
        card:  '0 14px 26px -16px rgba(28,42,33,.4)',
        lift:  '24px 40px 80px -32px rgba(28,42,33,.45)',
        cta:   '0 12px 24px -10px rgba(210,122,76,.7)',
        ctag:  '0 12px 24px -10px rgba(44,90,59,.7)',
      },
      backgroundImage: {
        canvas: 'radial-gradient(1200px 600px at 80% -5%, #EAF1E4 0%, transparent 55%), radial-gradient(900px 500px at 5% 110%, #F4E7D8 0%, transparent 50%)',
      },
      animation: {
        rise: 'rise .8s cubic-bezier(.2,.7,.2,1) forwards',
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(26px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
} satisfies Config;

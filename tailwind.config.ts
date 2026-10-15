import type { Config } from 'tailwindcss';

/**
 * Tokens taken verbatim from the rescue-kit mockup spec (CLAUDE.md §9).
 * Fonts: Fraunces (display, italic for accents) + Hanken Grotesk (body).
 * Palette: cream/forest/sage/clay/amber/sky.
 *
 * Do not invent new colors here — match the mockup.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Hanken Grotesk Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        cream:       'rgb(var(--c-cream) / <alpha-value>)',
        paper:       'rgb(var(--c-paper) / <alpha-value>)',
        ink:         'rgb(var(--c-ink) / <alpha-value>)',
        muted:       'rgb(var(--c-muted) / <alpha-value>)',
        forest:      'rgb(var(--c-forest) / <alpha-value>)',
        'forest-deep': 'rgb(var(--c-forest-deep) / <alpha-value>)',
        sage:        'rgb(var(--c-sage) / <alpha-value>)',
        'sage-line': 'rgb(var(--c-sage-line) / <alpha-value>)',
        clay:        'rgb(var(--c-clay) / <alpha-value>)',
        'clay-soft': 'rgb(var(--c-clay-soft) / <alpha-value>)',
        amber:       'rgb(var(--c-amber) / <alpha-value>)',
        'amber-soft':'rgb(var(--c-amber-soft) / <alpha-value>)',
        sky:         'rgb(var(--c-sky) / <alpha-value>)',
        'sky-soft':  'rgb(var(--c-sky-soft) / <alpha-value>)',
        line:        'rgb(var(--c-line) / <alpha-value>)',
        'line-2':    'rgb(var(--c-line-2) / <alpha-value>)',
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

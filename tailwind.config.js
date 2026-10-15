/**
 * Two colour systems share this config:
 *  - APP TOKENS (primary, secondary, canvas, panel, ink, success, warning, danger, on-*): CSS variables written by
 *    ThemeService from the tenant's published theme (or from a draft, scoped to the preview frame). Every dashboard
 *    screen and shared component uses these, never hard-coded colours.
 *  - ZestNovaForge identity (brand, navy, glow, surface, line): the public marketing site, scoped under .zp-public.
 * Public-site contrast notes (WCAG AA, 4.5:1 for body text):
 *  - brand (#1E50FF) on white .......... 5.8:1  -> OK for text and white-on-brand buttons in both themes
 *  - brand on obsidian (#090D16) ....... 3.4:1  -> NOT OK for text; use `glow` (#60A5FA/#38BDF8) for text in dark mode
 * @type {import('tailwindcss').Config}
 */
const token = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        primary: token('primary'),
        secondary: token('secondary'),
        canvas: token('canvas'),
        panel: token('panel'),
        ink: token('ink'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        'on-primary': token('on-primary'),
        'on-secondary': token('on-secondary'),
        brand: {
          DEFAULT: '#1E50FF',
          strong: '#0047FF',
          50: '#EEF3FF',
          100: '#DCE6FF',
          500: '#1E50FF',
          600: '#0047FF',
          700: '#0238CC'
        },
        navy: { DEFAULT: '#0A1128', 900: '#0F172A' },
        glow: { 400: '#38BDF8', 500: '#60A5FA' },
        surface: { light: '#F8FAFC', dark: '#090D16' },
        line: { light: '#E2E8F0', dark: '#1E293B' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        app: ['var(--font-app)'],
        // The purchasing workstation's typography (Obsidian Reserve): sculpted headings, a readable body and tabular figures.
        syne: ['Syne', 'Inter', 'system-ui', 'sans-serif'],
        jakarta: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        data: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(56,189,248,0.25), 0 0 32px -4px rgba(30,80,255,0.55)',
        'glow-sm': '0 0 18px -4px rgba(56,189,248,0.55)',
        card: '0 1px 2px rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.18)'
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #1E50FF 0%, #38BDF8 100%)',
        'grid-light':
          'linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)',
        'grid-dark':
          'linear-gradient(to right, rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.07) 1px, transparent 1px)'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        pulseGlow: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } }
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
        'pulse-glow': 'pulseGlow 3.5s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

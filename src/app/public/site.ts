/** Central site constants. Values marked PLACEHOLDER must be replaced before launch. */
export const SITE = {
  name: 'ZestPoint',
  parent: 'ZestNovaForge Limited',
  tagline: 'The Modular Enterprise POS Built for High-Velocity Hospitality & Retail',
  supportEmail: 'support@zestnovaforge.com',
  infoEmail: 'info@zestpoint.io',
  privacyEmail: 'privacy@zestnovaforge.com', // PLACEHOLDER: confirm the mailbox exists
  phone: '+234 000 000 0000', // PLACEHOLDER
  address: {
    lines: ['ZestNovaForge Limited', '[Registered office street address]', '[City], [State], Nigeria'], // PLACEHOLDER
    hours: 'Mon-Fri, 08:00-18:00 WAT'
  },
  lastUpdated: '1 January 2026' // legal pages: update on every revision
} as const;

export const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' }
] as const;

export const PORTAL_LOGIN_URL = '/login';
export const REGISTER_URL = '/register';

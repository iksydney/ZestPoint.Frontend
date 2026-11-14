// Used ONLY by the Playwright end-to-end run (ng serve --configuration e2e). It does not depend on, or overwrite, the generated environment.ts
// that your own .env.* files produce: the API is reached through the dev proxy (proxy.e2e.conf.json), same origin, relative /api.
export const environment = {
  production: false,
  apiBaseUrl: '',
  siteUrl: 'http://localhost:4300',
  // Guided tours do not start by themselves in the automated browser tests (one popping up would get in the way of every other test).
  // The tour's own test switches them on with localStorage 'zp.tours.auto' = 'on'.
  toursAutoStart: false
};

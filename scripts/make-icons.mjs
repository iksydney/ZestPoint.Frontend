/**
 * Makes the application's icons (public/icons/*.png and zestpoint.svg) from the ZestPoint mark: the gradient square with the white Z that
 * the public site's logo draws. Run it again only when the mark changes: `node scripts/make-icons.mjs`. The PNGs are committed, so a normal
 * build never needs a browser.
 *
 * It uses the Playwright that is already a dev dependency, with the Microsoft Edge that ships with Windows (the same as the end-to-end tests).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const GRADIENT = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E50FF"/><stop offset="1" stop-color="#38BDF8"/></linearGradient></defs>';

/** The Z is drawn on a 24-unit grid (x 5 to 19, y 6 to 18); `scale` sizes it and the translation centres it on the 512 canvas. */
const z = (scale) => `<path d="M5 6h14L5 18h14" transform="translate(${256 - 12 * scale} ${256 - 12 * scale}) scale(${scale})" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRADIENT}${body}</svg>`;

/** Rounded corners: for the browser tab, the home screen of a desktop, anywhere the icon is shown as drawn. */
const ROUNDED = svg(`<rect width="512" height="512" rx="112" fill="url(#g)"/>${z(20)}`);
/** Full square, the mark inside the middle 60 per cent: a phone crops it to its own shape (a circle, a squircle) and the Z must survive every crop. */
const FULL = svg(`<rect width="512" height="512" fill="url(#g)"/>${z(15)}`);

writeFileSync(join(out, 'zestpoint.svg'), ROUNDED);

const targets = [
  ['icon-192.png', 192, ROUNDED],
  ['icon-512.png', 512, ROUNDED],
  ['icon-maskable-512.png', 512, FULL],
  ['apple-touch-icon.png', 180, FULL]   // iOS rounds it itself and paints transparency black, so it is a full square
];

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  for (const [name, size, source] of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', name);
  }
} finally {
  await browser.close();
}

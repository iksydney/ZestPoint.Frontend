import { expect, test } from '@playwright/test';
import { signInViaUi } from './helpers';
import { ownerInApp } from './phone-helpers';

/**
 * The installable web application (enterprise programme, piece 13). The service worker is off in this test build, so what is checked here is what a phone
 * needs in order to offer the install: a manifest with icons that really are the sizes they say, the home-screen tags iPhone looks for, and the install hint
 * itself. The offline behaviour of the service worker is checked by hand against a production build (see findings FND-115).
 */

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/** The width and height written in a PNG's header. */
const pngSize = (bytes: Buffer): { w: number; h: number } => ({ w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) });

test.describe('Installable web application', () => {
  test('the manifest and icons are what a phone needs to offer the install', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/apple-touch-icon.png');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);

    const response = await page.request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation, 'a till and a stock count are used in either orientation').toBe('any');
    expect(manifest.start_url).toBe('/app');
    expect(manifest.name).toBe('ZestPoint POS');
    expect(manifest.short_name).toBe('ZestPoint');

    // The two sizes a browser asks for, a maskable one, and every file is a real PNG of the size the manifest claims.
    const icons = manifest.icons as { src: string; sizes: string; type: string; purpose?: string }[];
    expect(icons.map((i) => `${i.sizes}/${i.purpose}`).sort()).toEqual(['192x192/any', '512x512/any', '512x512/maskable']);
    for (const icon of [...icons, ...(manifest.shortcuts as { icons: typeof icons }[]).flatMap((s) => s.icons)]) {
      const file = await page.request.get(`/${icon.src}`);
      expect(file.ok(), icon.src).toBe(true);
      expect(file.headers()['content-type'], icon.src).toContain('image/png');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(await file.body()), icon.src).toEqual({ w, h });
    }
    const touch = await page.request.get('/icons/apple-touch-icon.png');
    expect(pngSize(await touch.body())).toEqual({ w: 180, h: 180 });

    // The shortcuts open real screens.
    for (const shortcut of manifest.shortcuts as { url: string }[]) expect(shortcut.url.startsWith('/app/')).toBe(true);
  });

  test('the install hint: how to do it on an iPhone, the browser\'s own offer on Android, put off for a while, and not on a computer', async ({ page, browser }) => {
    const who = await ownerInApp(page);

    // An iPhone has no install button to press: the hint says to use the Share menu. (Each device signs in for itself: a refresh cookie is single-use.)
    const iphone = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const ios = await iphone.newPage();
    await signInViaUi(ios, who);
    await expect(ios).toHaveURL(/\/app\//);
    await expect(ios.getByTestId('install-hint')).toBeVisible();
    await expect(ios.getByTestId('install-ios')).toContainText('Add to Home Screen');
    await expect(ios.getByTestId('install-now')).toHaveCount(0);                      // nothing to press: the browser made no offer
    await ios.getByTestId('install-dismiss').click();
    await expect(ios.getByTestId('install-hint')).toHaveCount(0);
    await ios.reload();
    await expect(ios.locator('main')).toBeVisible();
    await expect(ios.getByTestId('install-hint')).toHaveCount(0);                     // "Not now" lasts: it is remembered on this device
    await iphone.close();

    // Android Chrome and Edge make an offer; the hint keeps it for the Install button and uses it once.
    const android = await browser.newContext({ userAgent: ANDROID, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
    const droid = await android.newPage();
    await signInViaUi(droid, who);
    await expect(droid).toHaveURL(/\/app\//);
    await expect(droid.locator('main')).toBeVisible();
    await expect(droid.getByTestId('install-hint')).toHaveCount(0);                   // no offer yet: nothing to say
    await droid.evaluate(() => {
      const offer = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(offer, { prompt: () => { (window as unknown as { __prompted: boolean }).__prompted = true; return Promise.resolve(); }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
      window.dispatchEvent(offer);
    });
    await expect(droid.getByTestId('install-hint')).toBeVisible();
    await expect(droid.getByTestId('install-ios')).toHaveCount(0);
    await droid.getByTestId('install-now').click();
    await expect.poll(() => droid.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted === true)).toBe(true);
    await expect(droid.getByTestId('install-hint')).toHaveCount(0);                   // installed: nothing more to offer
    await android.close();

    // A computer with a mouse has the browser's own install button in the address bar: no hint.
    await page.goto('/app/dashboard');
    await expect(page.locator('main')).toBeVisible();
    await page.evaluate(() => {
      const offer = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(offer, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
      window.dispatchEvent(offer);
    });
    await page.waitForTimeout(500);
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
  });
});

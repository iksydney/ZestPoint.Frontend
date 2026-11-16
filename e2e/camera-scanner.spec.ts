import { expect, test } from '@playwright/test';
import { barcodeVideo } from './fake-camera';
import { addItem, newBill, ownerInApp, startCount, stockUp } from './phone-helpers';

/**
 * The camera as a barcode scanner (enterprise programme, piece 13), against a fake camera that shows one EAN-13 barcode. Whichever reader the browser
 * has (its own, or the bundled ZXing library) must read it. Also checked: the library's file comes from this application and never from an outside
 * address, and the camera is really off once the scanner closes.
 */

const CODE = '4006381333931';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${barcodeVideo(CODE)}`] },
  permissions: ['camera']
});

/** Remembers every camera track the page opens, so the test can say whether the camera was switched off. */
async function watchCamera(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cam: MediaStreamTrack[] };
    w.__cam = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => { const stream = await original(constraints); w.__cam.push(...stream.getTracks()); return stream; };
  });
}

const cameraOff = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const tracks = (window as unknown as { __cam: MediaStreamTrack[] }).__cam;
  return tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
});

test.describe('Camera scanner', () => {
  test('the till reads a barcode from the camera, loads nothing from outside, and switches the camera off', async ({ page }) => {
    test.slow();
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await watchCamera(page);
    await ownerInApp(page);
    await addItem(page, 'Tea', '700', CODE);
    await page.goto('/app/pos');
    await page.getByTestId('new-bill').click();
    await newBill(page, 'Camera');

    await page.getByTestId('scan-camera').click();
    await expect(page.getByTestId('scanner')).toBeVisible();
    await expect(page.getByTestId('scanner-feedback')).toContainText('OK: Tea', { timeout: 30_000 });
    await expect(page.getByTestId('scanner-problem')).toHaveCount(0);
    // Say which reader this browser used: the test passes with either, but the report should show which one was proved.
    const reader = (await page.getByTestId('scanner').getAttribute('data-engine')) ?? 'unknown';
    test.info().annotations.push({ type: 'reader', description: reader });
    console.log('READER USED:', reader);
    await page.getByTestId('scanner-done').click();
    await expect(page.getByTestId('scanner')).toHaveCount(0);
    await expect.poll(() => cameraOff(page), { message: 'the camera is still on after the scanner closed' }).toBe(true);
    await expect(page.getByTestId('line-Tea')).toBeVisible();

    // If the library was needed, its file came from this application; nothing was fetched from a CDN either way.
    const origin = new URL(page.url()).origin;
    for (const url of requests.filter((u) => /\.wasm(\?|$)/.test(u))) expect(new URL(url).origin, url).toBe(origin);
    expect(requests.filter((u) => /jsdelivr|unpkg|cdnjs/.test(u))).toEqual([]);
  });

  test('stock take reads a barcode and goes to that item, and the purchase order adds it', async ({ page }) => {
    test.slow();
    await watchCamera(page);
    await ownerInApp(page);
    await addItem(page, 'Whisky', '1200', CODE);
    await addItem(page, 'Gin', '900', '5449000000996');
    await stockUp(page, 'Whisky', '24');
    await stockUp(page, 'Gin', '12');
    await startCount(page);

    // One read, and the scanner closes itself: the person is counting, not scanning.
    await page.getByTestId('take-scan-camera').click();
    await expect(page.getByTestId('take-scan-note')).toHaveText('Found: Whisky', { timeout: 30_000 });
    await expect(page.getByTestId('scanner')).toHaveCount(0);
    await expect(page.getByTestId('count-Whisky')).toBeFocused();
    await expect.poll(() => cameraOff(page)).toBe(true);

    // The purchase order: the camera adds the item as Enter in the scan box does.
    await page.goto('/app/purchasing/orders/new');
    await page.getByTestId('po-scan-camera').click();
    await expect(page.getByTestId('scanner-feedback')).toContainText('OK: Added to the document', { timeout: 30_000 });
    await page.getByTestId('scanner-done').click();
    await expect(page.getByTestId('line-qty-0')).toBeVisible();
    await expect(page.getByTestId('line-qty-1')).toHaveCount(0);                     // the same code held still in front of the camera is not a second line
  });
});

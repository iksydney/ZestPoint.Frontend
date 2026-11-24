import { Page, expect, test } from '@playwright/test';
import { PASSWORD, registerViaUi, openPos } from './helpers';

/**
 * Owner's decisions of 2026-11-14:
 *  - a receipt is printed by itself and can be sent to the customer (its web link, a QR code, WhatsApp, e-mail, SMS, a picture);
 *  - the screen locks after a spell with no activity instead of signing anyone out; signing in on the lock carries on.
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function sellOne(page: Page, item: string, price: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(item);
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${item}`)).toBeVisible();

  await openPos(page);
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill('Walk in');
  await page.getByTestId('nb-create').click();
  await page.getByTestId(`product-${item}`).click();
  await page.getByTestId('pay').click();
  await page.getByTestId('pay-confirm').click();
  await expect(page.getByTestId('bill-status')).toHaveText('Paid');
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Receipts and the screen lock', () => {
  test('a receipt prints by itself and reaches the customer by link, QR code, WhatsApp, e-mail and SMS', async ({ page, browser }) => {
    await ownerInApp(page);
    await sellOne(page, 'Notebook', '1500');

    await page.getByTestId('receipt').click();
    const receipt = page.getByTestId('receipt-view');
    await expect(receipt).toContainText('1 x Notebook');
    await expect(page.getByTestId('receipt-total')).toContainText('1,500.00');
    await expect(page.getByTestId('receipt-served-by')).toContainText('Served by');
    await expect(page.getByTestId('receipt-when')).not.toBeEmpty();

    // Its link: carried by the QR code and by each message.
    const link = await page.getByTestId('receipt-qr').getAttribute('data-link');
    expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{40,}$/);
    await expect(page.getByTestId('receipt-qr').locator('svg')).toBeVisible();
    const encoded = encodeURIComponent(link!);
    expect(await page.getByTestId('receipt-whatsapp').getAttribute('href')).toContain('https://wa.me/?text=');
    expect(await page.getByTestId('receipt-whatsapp').getAttribute('href')).toContain(encoded);
    expect(await page.getByTestId('receipt-email').getAttribute('href')).toMatch(/^mailto:\?subject=/);
    expect(await page.getByTestId('receipt-email').getAttribute('href')).toContain(encoded);
    expect(await page.getByTestId('receipt-sms').getAttribute('href')).toContain(encoded);
    // A phone number typed for this customer goes into the WhatsApp address.
    await page.getByTestId('receipt-phone').fill('+234 801 234 5678');
    expect(await page.getByTestId('receipt-whatsapp').getAttribute('href')).toContain('https://wa.me/2348012345678?text=');

    // Print: what is printed is a page holding the receipt only, not the till screen.
    await page.evaluate(() => {
      (window as unknown as { __frames: string[] }).__frames = [];
      new MutationObserver((list) => {
        for (const m of list) for (const n of Array.from(m.addedNodes))
          if (n instanceof HTMLIFrameElement && n.dataset['testid'] === 'receipt-print-frame') (window as unknown as { __frames: string[] }).__frames.push(n.srcdoc);
      }).observe(document.body, { childList: true });
    });
    await page.getByTestId('reprint').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames.length)).toBe(1);
    const printed = await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames[0]!);
    expect(printed).toContain('1 x Notebook');
    expect(printed).toContain('@page { margin: 0; }');
    expect(printed).not.toContain('Take payment');
    expect(printed).not.toContain('btn-primary');

    // A picture of it can be downloaded.
    const download = page.waitForEvent('download');
    await page.getByTestId('receipt-download').click();
    expect((await download).suggestedFilename()).toMatch(/^receipt-\d+\.png$/);

    // The customer opens the link on their own phone: no sign-in, the same receipt, and nothing else of the business.
    const customer = await browser.newContext();
    const phone = await customer.newPage();
    await phone.goto(new URL(link!).pathname);
    await expect(phone.getByTestId('public-receipt')).toContainText('Your receipt from');
    await expect(phone.getByTestId('receipt-view')).toContainText('1 x Notebook');
    await expect(phone.getByTestId('receipt-total')).toContainText('1,500.00');
    await expect(phone.getByTestId('main-nav')).toHaveCount(0);

    // Everything beside the QR code and the Print button can be read: dark on the white card. (It used the app's near-white text, so on this page it was grey on white.)
    const readable = async (testId: string, within?: string) => {
      const target = within ? phone.getByTestId(testId).locator(within) : phone.getByTestId(testId);
      const [r, g, b, a] = await target.first().evaluate((el) => {
        const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).color)![1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
        return [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
      }) as [number, number, number, number];
      const over = [r, g, b].map((c) => c * a + 255 * (1 - a));            // the colour as it looks on the white card
      const lum = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = 0.2126 * lum(over[0]!) + 0.7152 * lum(over[1]!) + 0.0722 * lum(over[2]!);
      return (1 + 0.05) / (L + 0.05);                                      // contrast with white
    };
    expect(await readable('receipt-qr', 'xpath=following-sibling::p'), 'the words beside the QR code').toBeGreaterThanOrEqual(4.5);
    expect(await readable('receipt-download'), 'the Download button').toBeGreaterThanOrEqual(4.5);
    expect(await readable('receipt-copy'), 'the Copy link button').toBeGreaterThanOrEqual(4.5);
    await phone.goto('/r/this-is-not-a-real-receipt-link-0000000000000000');
    await expect(phone.getByTestId('public-receipt-error')).toContainText('not valid');
    await customer.close();
  });

  test('the screen locks after no activity, keeps the work, and opens again for the same person', async ({ page }) => {
    const who = await ownerInApp(page);
    await page.goto('/app/inventory/items');
    await expect(page.getByTestId('items-table')).toBeVisible();
    await expect(page.getByTestId('lock-screen')).toHaveCount(0);

    // The lock is off in the test build; this test switches it on, short.
    await page.evaluate(() => localStorage.setItem('zp.idle.seconds', '4'));
    await expect(page.getByTestId('idle-warning')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('idle-stay').click();                                       // "I am still here" starts the count again
    await expect(page.getByTestId('lock-screen')).toHaveCount(0);

    await expect(page.getByTestId('lock-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('lock-screen')).toContainText('work is kept');

    // A wrong password does not open it.
    await page.getByTestId('lock-mode-password').click();
    await page.getByTestId('lock-email').fill(who.email);
    await page.getByTestId('lock-password').fill('wrong-password-1');
    await page.getByTestId('lock-submit').click();
    await expect(page.getByTestId('lock-error')).toBeVisible();
    await expect(page.getByTestId('lock-screen')).toBeVisible();

    // The right one does, and the person is where they were.
    await page.getByTestId('lock-password').fill(PASSWORD);
    await page.getByTestId('lock-submit').click();
    await expect(page.getByTestId('lock-screen')).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/inventory\/items$/);
    await expect(page.getByTestId('items-table')).toBeVisible();
    await page.evaluate(() => localStorage.removeItem('zp.idle.seconds'));
  });
});

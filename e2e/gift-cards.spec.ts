import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * Gift cards (enterprise programme, piece 10): sold at the till on a bill of their own, issued with a code shown once when the bill is paid, spent as a payment (typed code,
 * balance checked first), listed for a manager who can cancel a lost card and issue a new one, and checked by the holder on a public page.
 */

async function newBill(page: Page, label: string, units: number): Promise<void> {
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  for (let i = 0; i < units; i++) await page.getByTestId('product-Soap').click();
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Gift cards', () => {
  test('a card is sold and issued with a code shown once, spent in parts, cancelled and issued again by a manager, and checked by the holder', async ({ page }) => {
    test.slow();
    await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);

    // The company says how long a card lasts.
    await page.goto('/app/settings/operations');
    await expect(page.getByTestId('giftcard-section')).toBeVisible();
    await page.getByTestId('giftcard-months').fill('12');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');

    // Soap is 1,000.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Soap');
    await page.getByTestId('item-price').fill('1000');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Soap')).toBeVisible();

    // At the till: a card worth 5,000 for Bola, paid in cash. The card is made when the bill is paid, and its code is shown once.
    await page.goto('/app/pos');
    await page.getByTestId('sell-gift-card').click();
    await page.getByTestId('gift-amount').fill('5000');
    await page.getByTestId('gift-name').fill('Bola Ade');
    await page.getByTestId('gift-email').fill('bola@example.com');
    await page.getByTestId('gift-start').click();
    await expect(page.getByTestId('pay-due')).toContainText('5,000.00');
    await page.getByTestId('method-GiftCard').count().then((n) => expect(n).toBe(0));        // a card cannot pay for a card
    await page.getByTestId('pay-tendered').fill('5000');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('gift-card-issued')).toBeVisible();
    const code = (await page.getByTestId('gift-card-code').innerText()).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    await expect(page.getByTestId('gift-card-qr').locator('svg')).toBeVisible();
    await expect(page.getByTestId('gift-card-message')).toContainText('queued');
    await page.getByTestId('gift-card-done').click();
    await expect(page.getByTestId('gift-card-issued')).toHaveCount(0);                       // gone from the screen
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('bill-gift')).toContainText(`ends ${code.slice(-4)}`);
    await expect(page.getByTestId('bill-gift')).not.toContainText(code);                     // the bill never knows the code again

    // Three soaps. 2,000 from the card: the code is checked first, a wrong one is not found, then the rest in cash.
    await newBill(page, 'Soap', 3);
    await page.getByTestId('pay').click();
    await page.getByTestId('method-GiftCard').click();
    await page.getByTestId('pay-amount').fill('2000');
    await expect(page.getByTestId('pay-confirm')).toBeDisabled();                            // no code yet
    await page.getByTestId('gift-code').fill('AAAA-AAAA-AAAA-AAAA');
    await page.getByTestId('gift-check').click();
    await expect(page.getByTestId('gift-check-error')).toContainText('not right');
    await page.getByTestId('gift-code').fill(code.toLowerCase());
    await page.getByTestId('gift-check').click();
    await expect(page.getByTestId('gift-balance')).toContainText('5,000.00');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('PartiallyPaid');
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-tendered').fill('1000');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');

    // The manager's screen: what is owed, the card with 3,000 left, and its history.
    await page.goto('/app/pos/reports/gift-cards');
    await expect(page.getByTestId('gc-title')).toHaveText('Gift Cards');
    await expect(page.getByTestId('gc-outstanding')).toContainText('3,000.00');
    await expect(page.getByTestId('gc-row-1')).toContainText('Bola Ade');
    await expect(page.getByTestId('gc-left-1')).toContainText('3,000.00');
    await expect(page.getByTestId('gc-status-1')).toHaveText('Active');
    await expect(page.getByTestId('gc-table')).not.toContainText(code.slice(0, 9));          // only the last four characters are ever shown
    await page.getByTestId('gc-view-1').click();
    await expect(page.getByTestId('gc-history')).toContainText('Spent on a bill');
    await expect(page.getByTestId('gc-history')).toContainText('Sold');
    await page.keyboard.press('Escape');

    // The card is lost: cancelled with a reason, its 3,000 issued again on a new card whose code is shown once.
    await page.getByTestId('gc-cancel-1').click();
    await expect(page.getByTestId('gc-cancel-confirm')).toBeDisabled();                      // a reason is needed
    await page.getByTestId('gc-reason').fill('Lost on a bus');
    await page.getByTestId('gc-cancel-confirm').click();
    await expect(page.getByTestId('gift-card-issued')).toBeVisible();
    const fresh = (await page.getByTestId('gift-card-code').innerText()).trim();
    expect(fresh).not.toBe(code);
    await page.getByTestId('gift-card-done').click();
    await expect(page.getByTestId('gc-status-1')).toHaveText('Cancelled');
    await expect(page.getByTestId('gc-left-2')).toContainText('3,000.00');
    await expect(page.getByTestId('gc-status-2')).toHaveText('Active');

    // The holder checks it with no sign-in: the new code works, the old one says it was cancelled, and a wrong one is not found.
    await page.goto('/gift-card');
    await page.getByTestId('pgc-code').fill(fresh);
    await page.getByTestId('pgc-check').click();
    await expect(page.getByTestId('pgc-balance')).toContainText('3,000.00');
    await expect(page.getByTestId('pgc-expiry')).toContainText('Valid until');
    await page.getByTestId('pgc-code').fill(code);
    await page.getByTestId('pgc-check').click();
    await expect(page.getByTestId('pgc-state')).toContainText('cancelled');
    await page.getByTestId('pgc-code').fill('AAAA-AAAA-AAAA-AAAA');
    await page.getByTestId('pgc-check').click();
    await expect(page.getByTestId('pgc-error')).toContainText('not right');
  });
});

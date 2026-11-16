import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * Owner's decisions of 2026-11-14: tips are tracked per member of staff and leave only through a recorded payout or donation; every
 * payment can be found for an audit; sign-in says plainly when someone is on the wrong side; the smallest phones can use every screen.
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function addItem(page: Page, name: string, price: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

async function billWith(page: Page, label: string, item: string) {
  await page.goto('/app/pos');
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  await page.getByTestId(`product-${item}`).click();
  // On a phone the bill is a panel that slides up from the bar at the bottom (piece 13): open it. On a wide screen it is already there.
  if (await page.getByTestId('bill-bar').isVisible()) await page.getByTestId('bill-bar-open').click();
  await expect(page.getByTestId(`line-${item}`)).toBeVisible();
}

/** Nothing on the page is wider than the screen (no sideways scrolling of the page itself). */
async function fits(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what} is wider than the screen by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Tips, audit filters, sign-in hints and small screens', () => {
  test('a tip is collected with the payment, held for whoever served, paid out, and every step can be found', async ({ page }) => {
    await ownerInApp(page);
    await addItem(page, 'Lunch', '5000');
    await billWith(page, 'Table 4', 'Lunch');

    // The tip typed in the pay box is added to what is collected, so the bill closes.
    const due = Number((await page.getByTestId('bill-balance').innerText()).replace(/[^0-9.]/g, ''));
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-tip').fill('500');
    await expect(page.getByTestId('pay-tip-note')).toBeVisible();
    await expect(page.getByTestId('pay-amount')).toHaveValue(String(due + 500));
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });

    // The register: collected, held, and the person it belongs to.
    await page.goto('/app/pos/tips');
    await expect(page.getByTestId('tips-collected')).toContainText('500.00');
    await expect(page.getByTestId('tips-held')).toContainText('500.00');
    const row = page.getByTestId('tips-staff').locator('tbody tr').first();
    await expect(row).toContainText('500.00');

    // Pay 300 of it out; more than what is held cannot be saved.
    await row.getByRole('button', { name: 'Pay out' }).click();
    await page.getByTestId('tip-amount').fill('900');
    await expect(page.getByTestId('tip-save')).toBeDisabled();
    await page.getByTestId('tip-amount').fill('300');
    await page.getByTestId('tip-reference').fill('ENV-17');
    await page.getByTestId('tip-save').click();
    await expect(page.getByTestId('tips-paid')).toContainText('300.00');
    await expect(page.getByTestId('tips-held')).toContainText('200.00');

    // The rest goes to a named organisation.
    await page.getByTestId('tip-donate').click();
    await page.getByTestId('tip-beneficiary').fill('Hope Children Home');
    await page.getByTestId('tip-amount').fill('200');
    await page.getByTestId('tip-method').selectOption('Bank');
    await page.getByTestId('tip-save').click();
    await expect(page.getByTestId('tips-donated')).toContainText('200.00');
    await expect(page.getByTestId('tips-held')).toContainText('0.00');
    await expect(page.getByTestId('tips-entries')).toContainText('Hope Children Home');

    // A mistake is reversed with a reason and stays in the list.
    await page.getByTestId('tip-reverse-2').click();
    await page.getByTestId('tip-reverse-reason').fill('Wrong organisation');
    await page.getByTestId('tip-reverse-confirm').click();
    await expect(page.getByTestId('tips-held')).toContainText('200.00');
    await expect(page.getByTestId('tips-entry-2')).toContainText('Reversed by');

    // The Tips report and the Payments history find it.
    await page.goto('/app/pos/reports/tips');
    await expect(page.getByTestId('report-summary')).toContainText('500.00');
    await page.goto('/app/pos/reports/payments-history');
    await expect(page.getByTestId('report-table')).toContainText('Table 4');
    await page.getByTestId('filter-flag').selectOption('tips');
    await page.getByTestId('filter-min-amount').fill('100');
    await page.getByTestId('filter-apply').click();
    await expect(page.getByTestId('report-table')).toContainText('Table 4');
    await page.getByTestId('filter-method').selectOption('Card');
    await page.getByTestId('filter-apply').click();
    await expect(page.getByTestId('report-table')).not.toContainText('Table 4');

    // The activity log narrows to tips paid out or donated, and to a word in the details.
    await page.goto('/app/staff');
    await page.getByRole('tab', { name: 'Activity log' }).click();
    await page.getByTestId('audit-filter').selectOption('pos.tips');
    await expect(page.getByTestId('audit-table')).toContainText('pos.tips.paid_out');
    await expect(page.getByTestId('audit-table')).not.toContainText('auth.login');
    await page.getByTestId('audit-search').fill('Hope Children');
    await expect(page.getByTestId('audit-table')).toContainText('pos.tips.donated');
    await expect(page.getByTestId('audit-table')).not.toContainText('pos.tips.paid_out');
    await page.getByTestId('audit-clear').click();
    await expect(page.getByTestId('audit-search')).toHaveValue('');
  });

  test('sign-in says plainly when a staff code is typed on the owner side, and points at Staff PIN', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-slug').fill('la-bodega');
    await page.getByTestId('login-email').fill('LB-003');
    await page.getByTestId('login-password').fill('12345678');
    const hint = page.getByTestId('login-wrong-side');
    await expect(hint).toContainText('looks like a staff code');
    await expect(hint).toContainText('Staff PIN');
    await expect(page.getByTestId('login-submit')).toBeDisabled();
    await expect(page.getByTestId('mode-pin')).toHaveClass(/ring-2/);                    // the button to press is marked

    await page.getByTestId('login-switch-pin').click();
    await expect(page.getByTestId('login-code')).toHaveValue('LB-003');                  // the code came along
    await expect(page.getByTestId('login-wrong-side')).toHaveCount(0);

    // A PIN that is too short, and an e-mail address on the staff side, are explained too.
    await page.getByTestId('login-pin').fill('12');
    await expect(page.getByTestId('login-hint')).toContainText('at least 4 numbers');
    await page.getByTestId('login-code').fill('ada@example.com');
    await expect(page.getByTestId('login-wrong-side')).toContainText('Owner / admin');
    await page.getByTestId('login-switch-password').click();
    await expect(page.getByTestId('login-email')).toHaveValue('ada@example.com');
    await page.getByTestId('login-email').fill('ada-at-example');
    await expect(page.getByTestId('login-hint')).toContainText('name@example.com');
  });

  test('the smallest phones can use the main screens without the page scrolling sideways', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await addItem(page, 'Tea', '700');
    await page.setViewportSize({ width: 320, height: 568 });   // the narrowest phone still in use

    await page.goto('/login');
    await fits(page, 'Sign in');   // redirects into the application for someone signed in; the frame is checked either way

    for (const [path, ready, name] of [
      ['/app/dashboard', 'open-tabs', 'Dashboard'], ['/app/inventory/items', 'items-table', 'Items'], ['/app/inventory', 'new-item', 'Stock Overview'],
      ['/app/pos/tips', 'tips-entries', 'Tips'], ['/app/pos/reports/payments-history', 'report-filters', 'Payments history'], ['/app/pos/reports/tips', 'report-filters', 'Tips report'],
      ['/app/customers', 'main-nav', 'Customers'], ['/app/staff', 'main-nav', 'Staff'], ['/app/settings/operations', 'settings-save', 'Operations settings'],
      ['/app/branding', 'main-nav', 'Branding'], ['/app/purchasing/orders', 'main-nav', 'Purchase orders'], ['/app/ledger/accounts', 'main-nav', 'Chart of accounts'], ['/app/pos/day-management', 'main-nav', 'Start / End of Day'], ['/app/subscription', 'main-nav', 'Subscription']
    ] as const) {
      await page.goto(path);
      // Some screens have their own frame: for those, wait for the heading.
      await expect((ready === 'main-nav' ? page.locator('h1') : page.getByTestId(ready)).first()).toBeAttached();
      await page.waitForLoadState('networkidle');
      await fits(page, name);
    }

    // The till: the bill, the pay box and the receipt box.
    await billWith(page, 'Small', 'Tea');
    await fits(page, 'Point of sale');
    await page.getByTestId('pay').click();
    await expect(page.getByTestId('pay-confirm')).toBeVisible();
    await fits(page, 'Take payment');
    const pay = await page.getByTestId('pay-confirm').boundingBox();
    expect(pay!.x + pay!.width).toBeLessThanOrEqual(320);
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId('receipt').click();
    await expect(page.getByTestId('receipt-view')).toBeVisible();
    await fits(page, 'Receipt');
    const receipt = await page.getByTestId('receipt-view').boundingBox();
    expect(receipt!.x).toBeGreaterThanOrEqual(0);
    expect(receipt!.x + receipt!.width).toBeLessThanOrEqual(320);

    // The stock card.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-edit-Tea').click();
    await expect(page.getByTestId('stock-card')).toBeVisible();
    await fits(page, 'Stock card');
  });
});

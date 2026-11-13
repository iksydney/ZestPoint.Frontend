import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi } from './helpers';

/** Registers a company, publishes the starter brand and loads the labelled demonstration data (the dev environment allows it). */
async function shopWithDemoData(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await page.goto('/app/settings/operations');
  await page.getByTestId('seed-demo').click();
  await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);
  return who;
}

async function openPos(page: Page) {
  await page.goto('/app/pos');
  await expect(page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
}

async function startBill(page: Page, label: string) {
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  await expect(page.getByTestId('current-bill')).toContainText(label);
}

async function waitForSync(page: Page) {
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

async function stockOf(page: Page, item: string): Promise<string> {
  await page.goto('/app/inventory');
  const row = page.getByTestId(`item-${item}`);
  await expect(row).toBeVisible();
  return (await row.getByTestId('on-hand').innerText()).replace(/\s+/g, ' ');
}

async function addPinCashier(page: Page, name: string, pin = '7391'): Promise<string> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId('new-role-cashier').check();
  await page.getByTestId('create-staff').click();
  const shown = (await page.getByTestId('staff-added-code').innerText()).trim();       // the panel shown right after adding
  await page.getByTestId('staff-added-done').click();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  expect((await row.locator('td').nth(1).innerText()).trim()).toBe(shown);
  return shown;
}

test.describe('Point of sale and inventory (criteria 18-24)', () => {
  test('a bill is built, sent, paid in cash, receipted, and the stock is depleted from the recipe', async ({ page }) => {
    await shopWithDemoData(page);
    await openPos(page);
    await startBill(page, 'Table 5');

    await page.getByTestId('product-Demo Gin & Tonic').click();
    await page.getByTestId('mod-add').click();
    await page.getByTestId('product-Demo Gin & Tonic').click();
    await page.getByTestId('mod-add').click();
    await expect(page.getByTestId('bill-total')).toContainText('7,000.00');

    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('bill-lines')).toContainText('sent');

    await page.getByTestId('pay').click();
    await page.getByTestId('pay-tendered').fill('8000');
    await expect(page.getByTestId('pay-change')).toContainText('1,000.00');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');

    await waitForSync(page);
    await page.getByTestId('receipt').click();
    await expect(page.getByTestId('receipt-total')).toContainText('7,000.00');

    // 2 x (50 ml gin) from the opening 2,100 ml.
    expect(await stockOf(page, 'Demo Gin 700ml')).toContain('2,000');
  });

  test('the bill splits evenly into shares that sum exactly to the balance', async ({ page }) => {
    await shopWithDemoData(page);
    await openPos(page);
    await startBill(page, 'Even split');
    for (let i = 0; i < 3; i++) await page.getByTestId('product-Demo Canned Beans').click();
    await expect(page.getByTestId('bill-total')).toContainText('2,700.00');

    await page.getByTestId('pay').click();
    await page.getByTestId('split-4').click();
    await expect(page.getByTestId('shares')).toContainText('675.00 + 675.00 + 675.00 + 675.00');
    await page.getByTestId('split-2').click();
    await expect(page.getByTestId('pay-amount')).toHaveValue('1350');
  });

  test('selling works offline, shows what is waiting, and syncs exactly once when the connection returns', async ({ page, context }) => {
    await shopWithDemoData(page);
    await openPos(page);

    await context.setOffline(true);
    await expect(page.locator('[data-testid="sync-status"] [data-state="offline"]')).toBeVisible();

    await startBill(page, 'Offline tab');
    await page.getByTestId('barcode').fill('DEMO-0000000001');
    await page.getByTestId('barcode').press('Enter');
    await expect(page.getByTestId('bill-total')).toContainText('900.00');

    await page.getByTestId('pay').click();
    await expect(page.getByTestId('method-Card')).toBeVisible();
    await page.getByTestId('method-Card').click();
    await expect(page.getByTestId('pay-confirm')).toBeDisabled(); // card needs a connection
    await page.getByTestId('method-Cash').click();
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('sync-pending')).toBeVisible();

    await context.setOffline(false);
    await waitForSync(page);

    // Exactly one bag of beans left the shelf: 48 -> 47.
    expect(await stockOf(page, 'Demo Canned Beans 400g')).toContain('47');
  });

  test('a declined card leaves the bill unpaid and an approved one marks the receipt as a demonstration', async ({ page }) => {
    await shopWithDemoData(page);
    await openPos(page);
    await startBill(page, 'Card bill');
    await page.getByTestId('product-Demo Canned Beans').click();

    await page.getByTestId('pay').click();
    await page.getByTestId('method-Card').click();
    await expect(page.getByTestId('demo-payment-note')).toContainText('no real money');
    await page.getByTestId('pay-token').fill('tok_decline');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('pay-error')).toContainText(/declined/i);

    await page.getByTestId('pay-token').fill('tok_ok');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');

    await page.getByTestId('receipt').click();
    await expect(page.getByTestId('receipt-view')).toContainText('DEMONSTRATION PAYMENT');
  });

  test('a cashier can only request a void; a manager approves it and the stock comes back', async ({ page, browser }) => {
    const who = await shopWithDemoData(page);
    const code = await addPinCashier(page, 'Cash Ier');

    await openPos(page);
    await startBill(page, 'Void me');
    await page.getByTestId('product-Demo Canned Beans').click();
    await page.getByTestId('send-order').click();
    await waitForSync(page);

    const cashier = await newContext(browser);
    await cashier.page.goto('/login');
    await cashier.page.getByTestId('login-slug').fill(who.slug);
    await cashier.page.getByTestId('mode-pin').click();
    await cashier.page.getByTestId('login-code').fill(code);
    await cashier.page.getByTestId('login-pin').fill('7391');
    await cashier.page.getByTestId('login-submit').click();
    await expect(cashier.page).toHaveURL(/\/app\/(dashboard|pos)$/);
    await cashier.page.getByTestId('main-nav').getByRole('link', { name: 'Point of Sale' }).click();
    await cashier.page.getByTestId('bill-Void me').click();
    await expect(cashier.page.getByTestId('open-approvals')).toHaveCount(0); // not an approver
    await cashier.page.getByTestId('void-Demo Canned Beans').click();
    await cashier.page.getByTestId('void-reason').fill('Customer changed their mind');
    await cashier.page.getByTestId('void-confirm').click();
    await expect(cashier.page.getByTestId('bill-lines')).toContainText('awaiting approval');
    await waitForSync(cashier.page);
    await cashier.context.close();

    await page.goto('/app/pos');
    await page.getByTestId('open-approvals').click();
    await page.getByTestId('void-approve').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('bill-Void me').click();
    await expect(page.getByTestId('bill-lines')).not.toContainText('Demo Canned Beans');

    expect(await stockOf(page, 'Demo Canned Beans 400g')).toContain('48');
  });

  test('stock adjustments need a reason, are recorded in the ledger and a count below zero is shown honestly', async ({ page }) => {
    await shopWithDemoData(page);
    await page.goto('/app/inventory');
    await page.getByTestId('adjust-Demo Canned Beans 400g').click();
    await page.getByTestId('adjust-type').selectOption('Breakage');
    await page.getByTestId('adjust-qty').fill('50');
    await expect(page.getByTestId('adjust-save')).toBeDisabled(); // no reason yet
    await page.getByTestId('adjust-reason').fill('Pallet dropped');
    await page.getByTestId('adjust-save').click();
    await waitForSync(page);
    await expect(page.getByTestId('item-Demo Canned Beans 400g').getByTestId('on-hand')).toContainText('-2');
  });

  test('a manual stock count shows variance against expected and severity, and never rewrites the book stock by itself', async ({ page }) => {
    await shopWithDemoData(page);
    await page.goto('/app/inventory');
    await page.getByTestId('tab-audits').click();
    await page.getByTestId('start-audit').click();
    await page.getByTestId('audit-station').fill('Main bar');
    await page.getByTestId('audit-shift').fill('Night');
    await page.getByTestId('audit-start').click();

    await page.getByTestId('measure-item').selectOption({ label: 'Demo Tonic Water' });
    await page.getByTestId('measure-qty').fill('4800'); // expected 6000 -> -20%
    await page.getByTestId('measure-save').click();

    const row = page.getByTestId('measurement-Demo Tonic Water');
    await expect(row.getByTestId('variance')).toContainText('-1,200');
    await expect(row.getByTestId('variance-pct')).toContainText('-20');
    await expect(row.getByTestId('severity')).toHaveText('Escalate');
    await expect(row).toContainText('Manual');

    await page.getByTestId('complete-audit').click();
    await page.getByText('All audits').click();
    await page.getByTestId('tab-stock').click();
    await expect(page.getByTestId('item-Demo Tonic Water').getByTestId('on-hand')).toContainText('6,000'); // book stock untouched
  });
});

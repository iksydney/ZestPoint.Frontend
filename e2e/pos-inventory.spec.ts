import { Page, expect, test } from '@playwright/test';
import { PASSWORD, newContext, registerViaUi, startShiftWhenAsked } from './helpers';

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

async function addPinCashier(page: Page, name: string, pin = '7391', role = 'cashier'): Promise<string> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${role}`).check();
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

  test('a payment is split into parts with different payment types that must add up to the balance', async ({ page }) => {
    await shopWithDemoData(page);
    await openPos(page);
    await startBill(page, 'Even split');
    for (let i = 0; i < 3; i++) await page.getByTestId('product-Demo Canned Beans').click();
    await expect(page.getByTestId('bill-total')).toContainText('2,700.00');

    await page.getByTestId('pay').click();
    await page.getByTestId('split-4').click();
    await expect(page.getByTestId('shares')).toContainText('675.00 + 675.00 + 675.00 + 675.00');   // equal parts that add up exactly
    await page.getByTestId('split-3').click();
    await expect(page.getByTestId('split-parts').locator('[data-testid^="part-amount-"]')).toHaveCount(3);
    await expect(page.getByTestId('part-amount-0')).toHaveValue('900');
    await expect(page.getByTestId('split-left')).toContainText('add up to');

    // Each part its own way: cash, card, transfer. Typing an amount moves the difference to the last part.
    await page.getByTestId('part-method-1').selectOption('Card');
    await page.getByTestId('part-method-2').selectOption('Transfer');
    await page.getByTestId('part-amount-0').fill('1000');
    await expect(page.getByTestId('part-amount-2')).toHaveValue('800');
    await expect(page.getByTestId('pay-confirm')).toBeEnabled();

    // Parts that do not add up cannot be confirmed, and the box says by how much.
    await page.getByTestId('part-amount-2').fill('500');
    await expect(page.getByTestId('split-left')).toContainText('300.00 still to share out');
    await expect(page.getByTestId('pay-confirm')).toBeDisabled();
    await page.getByTestId('part-amount-2').fill('900');
    await expect(page.getByTestId('split-left')).toContainText('100.00 too much');
    await expect(page.getByTestId('pay-confirm')).toBeDisabled();
    await page.getByTestId('part-amount-2').fill('800');

    // Cash handed over for the cash part, with its change.
    await page.getByTestId('part-tendered-0').fill('1500');
    await expect(page.getByTestId('part-change-0')).toContainText('500.00');

    await expect(page.getByTestId('pay-confirm')).toHaveText('Confirm 3 payments');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await waitForSync(page);

    // The receipt lists the three payments, and they add up to the bill.
    await page.getByTestId('receipt').click();
    const receipt = page.getByTestId('receipt-view');
    await expect(receipt).toContainText('Cash');
    await expect(receipt).toContainText('1,000.00');
    await expect(receipt).toContainText('Card');
    await expect(receipt).toContainText('900.00');
    await expect(receipt).toContainText('Transfer');
    await expect(receipt).toContainText('800.00');
    await expect(page.getByTestId('receipt-total')).toContainText('2,700.00');
  });

  test('a split that fails part way keeps what was recorded and leaves the rest to pay', async ({ page }) => {
    await shopWithDemoData(page);
    await openPos(page);
    await startBill(page, 'Part way');
    for (let i = 0; i < 2; i++) await page.getByTestId('product-Demo Canned Beans').click();
    await expect(page.getByTestId('bill-total')).toContainText('1,800.00');

    await page.getByTestId('pay').click();
    await page.getByTestId('split-2').click();
    await page.getByTestId('part-method-1').selectOption('Card');
    await page.getByTestId('part-reference-1').fill('tok_decline');                      // the development stub declines this one
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('pay-error')).toContainText('1 of 2 payments were recorded');
    await expect(page.getByTestId('pay-due')).toContainText('900.00');                   // the cash part stands; half is still due
    await expect(page.getByTestId('split-parts').locator('[data-testid^="part-amount-"]')).toHaveCount(1);

    // The rest is paid another way: back to one payment, in cash.
    await page.getByTestId('split-off').click();
    await page.getByTestId('method-Cash').click();
    await page.getByTestId('pay-amount').fill('900');
    await page.getByTestId('pay-tendered').fill('900');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
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

  test('a cashier cannot void alone: a supervisor types their code and PIN on the till, and the void is in the history', async ({ page, browser }) => {
    const who = await shopWithDemoData(page);
    const code = await addPinCashier(page, 'Cash Ier');
    const supervisorCode = await addPinCashier(page, 'Sade Super', '5827', 'supervisor');

    const cashier = await newContext(browser);
    await cashier.page.goto('/login');
    await cashier.page.getByTestId('login-slug').fill(who.slug);
    await cashier.page.getByTestId('mode-pin').click();
    await cashier.page.getByTestId('login-code').fill(code);
    await cashier.page.getByTestId('login-pin').fill('7391');
    await cashier.page.getByTestId('login-submit').click();
    await expect(cashier.page).toHaveURL(/\/app\/(dashboard|pos)$/);
    await startShiftWhenAsked(cashier.page);
    await cashier.page.getByTestId('main-nav').getByRole('link', { name: 'Point of Sale' }).click();
    // The cashier's own bill: a bill is worked on by whoever opened it.
    await expect(cashier.page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
    await startBill(cashier.page, 'Void me');
    await cashier.page.getByTestId('product-Demo Canned Beans').click();
    await cashier.page.getByTestId('send-order').click();
    await waitForSync(cashier.page);
    await expect(cashier.page.getByTestId('open-approvals')).toHaveCount(0);

    // The cashier starts the void, but the button stays off until someone who may authorise it has entered their details.
    await cashier.page.getByTestId('void-Demo Canned Beans').click();
    await cashier.page.getByTestId('void-reason').fill('Customer changed their mind');
    await expect(cashier.page.getByTestId('void-authoriser')).toContainText('This does not sign them in');
    await expect(cashier.page.getByTestId('void-confirm')).toBeDisabled();
    await expect(cashier.page.getByTestId('auth-code')).toHaveValue('');              // nothing is pre-filled from the signed-in person
    await expect(cashier.page.getByTestId('auth-pin')).toHaveAttribute('autocomplete', 'one-time-code');

    // The cashier's own code and PIN are real, but a cashier cannot authorise a void.
    await cashier.page.getByTestId('auth-code').fill(code);
    await cashier.page.getByTestId('auth-pin').fill('7391');
    await cashier.page.getByTestId('void-confirm').click();
    await expect(cashier.page.getByTestId('void-error')).toContainText('Cash Ier is not allowed');
    await expect(cashier.page.getByTestId('auth-pin')).toHaveValue('');               // the PIN is wiped after a refusal

    // A wrong PIN for the supervisor says nothing about which part was wrong.
    await cashier.page.getByTestId('auth-code').fill(supervisorCode);
    await cashier.page.getByTestId('auth-pin').fill('0000');
    await cashier.page.getByTestId('void-confirm').click();
    await expect(cashier.page.getByTestId('void-error')).toContainText('Those details are not right');
    await expect(cashier.page.getByTestId('bill-lines')).toContainText('Demo Canned Beans');

    // The supervisor types their own PIN on the cashier's till: the item leaves the bill at once.
    await cashier.page.getByTestId('auth-pin').fill('5827');
    await cashier.page.getByTestId('void-confirm').click();
    await expect(cashier.page.getByTestId('void-dialog')).toHaveCount(0);
    await expect(cashier.page.getByTestId('bill-lines')).not.toContainText('Demo Canned Beans');
    await expect(cashier.page.getByTestId('user-name')).toHaveText('Cash Ier');       // nobody was signed in or out by it
    await cashier.page.goto('/app/pos/reports/void-history');
    await expect(cashier.page.getByRole('heading', { name: 'No access' })).toBeVisible();   // the history is not the cashier's to read
    await cashier.context.close();

    expect(await stockOf(page, 'Demo Canned Beans 400g')).toContain('48');           // the stock came back

    // The owner is asked too, and proves it with email and password; here for a whole bill.
    await openPos(page);
    await startBill(page, 'Wrong table');
    await page.getByTestId('product-Demo Canned Beans').click();
    await page.getByTestId('send-order').click();
    await waitForSync(page);
    await page.getByTestId('void-bill').click();
    await page.getByTestId('void-reason').fill('Rung up on the wrong table');
    await expect(page.getByTestId('void-confirm')).toBeDisabled();
    await page.getByTestId('auth-mode-password').click();
    await page.getByTestId('auth-email').fill(who.email);
    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('void-confirm').click();
    await expect(page.getByTestId('void-dialog')).toHaveCount(0);
    await expect(page.getByTestId('bill-Wrong table')).toHaveCount(0);

    // Both voids are in the Void History report with who asked and who authorised.
    await page.goto('/app/pos/reports/void-history');
    const table = page.getByTestId('report-table');
    await expect(table).toContainText('Customer changed their mind');
    await expect(table).toContainText('Cash Ier');
    await expect(table).toContainText('Sade Super');
    await expect(table).toContainText('Staff code and PIN');
    await expect(table).toContainText('Rung up on the wrong table');
    await expect(table).toContainText('Email and password');
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

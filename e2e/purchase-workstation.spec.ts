import { Page, expect, test } from '@playwright/test';
import { lineAmounts, netUnitCost, quantityFromPacks, round2, sumLines, tareWithinTolerance } from '../src/app/core/purchase-math';
import { newContext, registerViaUi } from './helpers';

/** The same worked examples the server's PurchaseMath tests use: the screen and the server must never disagree. */
test.describe('Purchase maths on the screen matches the server', () => {
  test('a line works out discount, then tax on top', () => {
    expect(lineAmounts({ quantity: 24, unitCost: 28.5, discountPercent: 5, taxRatePercent: 10 }, false)).toEqual({ gross: 684, discount: 34.2, net: 649.8, tax: 64.98, total: 714.78 });
  });

  test('when prices include tax the tax is taken out and the total does not change', () => {
    expect(lineAmounts({ quantity: 24, unitCost: 28.5, discountPercent: 5, taxRatePercent: 10 }, true)).toEqual({ gross: 684, discount: 34.2, net: 649.8, tax: 59.07, total: 649.8 });
  });

  test('half-way amounts round away from zero, as a decimal type does', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    const lines = [lineAmounts({ quantity: 3, unitCost: 0.335, discountPercent: 0, taxRatePercent: 7.5 }, false), lineAmounts({ quantity: 3, unitCost: 0.335, discountPercent: 0, taxRatePercent: 7.5 }, false)];
    const t = sumLines(lines);
    expect([t.subtotal, t.tax]).toEqual([2.02, 0.16]);
  });

  test('stock is valued after discount and without tax; packs and tare behave', () => {
    expect(netUnitCost(28.5, 5, 10, false)).toBe(27.075);
    expect(netUnitCost(28.5, 5, 10, true)).toBe(24.6136);
    expect(quantityFromPacks(2, 12)).toBe(24);
    expect(tareWithinTolerance(1348, 1350)).toBe(true);
    expect(tareWithinTolerance(1400, 1350)).toBe(false);
    expect(tareWithinTolerance(null, 1350)).toBeNull();
  });
});

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function addPinStaff(page: Page, name: string, roleKey: string, pin: string): Promise<string> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  await page.getByTestId('create-staff').click();
  const shown = (await page.getByTestId('staff-added-code').innerText()).trim();       // the panel shown right after adding
  await page.getByTestId('staff-added-done').click();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  expect((await row.locator('td').nth(1).innerText()).trim()).toBe(shown);
  return shown;
}

async function pinSignIn(page: Page, slug: string, code: string, pin: string) {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(slug);
  await page.getByTestId('mode-pin').click();
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/app\/(dashboard|pos)/);
}

async function newItem(page: Page, name: string, barcode: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-barcode').fill(barcode);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

async function newBin(page: Page, code: string, secure = false) {
  await page.getByTestId('bin-new').click();
  await page.getByTestId('bin-code').fill(code);
  await page.getByTestId('bin-name').fill(`Bin ${code}`);
  if (secure) await page.getByTestId('bin-secure').check();
  await page.getByTestId('bin-save').click();
  await expect(page.getByTestId(`bin-row-${code}`)).toBeVisible();
}

test.describe('Purchase order workstation and goods receiving', () => {
  test('an order is priced on screen, posted and approved, received by someone else, and a secure bin waits for a second key', async ({ page, browser }) => {
    test.setTimeout(300_000);
    const who = await ownerInApp(page);
    await newItem(page, 'Woodford Reserve', '5000281000011');
    await newItem(page, 'Dom Perignon', '5000281000028');
    await page.goto('/app/inventory/bins');
    await page.waitForLoadState('networkidle');
    await newBin(page, 'VAULT-A1');
    await newBin(page, 'LOCK-01', true);
    const clerkCode = await addPinStaff(page, 'Marcus Thorne', 'receiver', '6391');

    // The order screen: a supplier is added in place, lines are scanned and every figure follows the typing.
    await page.goto('/app/purchasing/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('po-supplier-new').click();
    await page.getByTestId('supplier-name').fill('Highland Distillers');
    await page.getByTestId('supplier-email').fill('sales@highland.test');
    await page.getByTestId('supplier-taxid').fill('GB-9948201-9B');
    await page.getByTestId('supplier-rep').fill('Marcus Vance');
    await page.getByTestId('supplier-limit').fill('50000');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('po-supplier-name')).toHaveText('Highland Distillers');
    await expect(page.getByTestId('po-available')).toContainText('50,000.00');

    await page.getByTestId('po-scan').fill('5000281000011');
    await page.getByTestId('po-scan').press('Enter');
    await expect(page.getByTestId('line-0')).toContainText('Woodford Reserve');
    await page.getByTestId('line-qty-0').fill('24');
    await page.getByTestId('line-cost-0').fill('28.5');
    await page.getByTestId('line-disc-0').fill('5');
    await page.getByTestId('line-tax-0').fill('10');
    await expect(page.getByTestId('line-total-0')).toHaveText('714.78');
    await page.getByTestId('line-bin-0').selectOption({ label: 'VAULT-A1' });

    await page.getByTestId('po-scan').fill('5000281000028');
    await page.getByTestId('po-scan').press('Enter');
    await expect(page.getByTestId('line-1')).toContainText('Dom Perignon');
    await page.getByTestId('line-qty-1').fill('6');
    await page.getByTestId('line-cost-1').fill('210');
    await page.getByTestId('line-tax-1').fill('10');
    await expect(page.getByTestId('line-total-1')).toHaveText('1,386.00');
    await page.getByTestId('line-bin-1').selectOption({ label: 'LOCK-01 (secure)' });

    await expect(page.getByTestId('po-subtotal')).toHaveText('1,944.00');
    await expect(page.getByTestId('po-discount')).toContainText('34.20');
    await expect(page.getByTestId('po-net')).toHaveText('1,909.80');
    await expect(page.getByTestId('po-tax')).toHaveText('190.98');
    await expect(page.getByTestId('po-total')).toHaveText('2,100.78');
    await expect(page.getByTestId('po-units')).toHaveText('30');

    // Switching tax-inclusive pricing changes the arithmetic at once: the tax is taken out of the prices instead of added.
    await page.getByTestId('po-inclusive').check({ force: true });
    await expect(page.getByTestId('po-total')).toHaveText('1,909.80');
    await page.getByTestId('po-inclusive').uncheck({ force: true });
    await expect(page.getByTestId('po-total')).toHaveText('2,100.78');

    await page.getByTestId('po-invoice').fill('INV-883921');
    await page.getByTestId('po-post').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('po-status')).toContainText('Posted');
    await expect(page.getByTestId('po-number')).toContainText(/^PO-\d{4}-\d{5}$/);
    const orderUrl = page.url();
    await expect(page.getByTestId('po-approve')).toBeVisible();     // the owner may approve what they posted
    await page.getByTestId('po-approve').click();
    await expect(page.getByTestId('po-status')).toContainText('Approved');
    await expect(page.getByTestId('po-receive')).toBeVisible();

    // The receiver, a different person, sees no costs, checks the delivery and commits.
    const clerk = await newContext(browser);
    const c = clerk.page;
    await pinSignIn(c, who.slug, clerkCode, '6391');
    await c.goto('/app/purchasing/receiving');
    await expect(c.getByTestId('queue-orders')).toContainText('Highland Distillers');
    await c.getByTestId('queue-orders').getByRole('link', { name: 'Receive' }).first().click();
    await expect(c.getByTestId('rcv-doc')).toContainText(/^PO-/);
    await expect(c.getByTestId('rcv-value')).toHaveCount(0);        // valuation is for people who may see costs
    await c.getByTestId('rcv-scan').fill('5000281000011');
    await c.getByTestId('rcv-scan').press('Enter');
    await expect(c.getByTestId('raccept-' + (await skuOrName(c, 0)))).toHaveValue('1');
    await c.getByTestId('rcv-all').click();
    await expect(c.getByTestId('rcv-intake')).toHaveText('30');
    await expect(c.getByTestId('rcv-dual')).toContainText('Second key needed for 1 secure line');
    await c.getByTestId('rcv-bay').fill('Bay 03');
    await c.getByTestId('rcv-seal').fill('SSL-8849');
    await c.getByTestId('rcv-commit').click();
    await c.getByTestId('confirm-ok').click();
    await expect(c.getByTestId('grn-status')).toHaveText('Awaiting the second key');
    await expect(c.getByTestId('grn-cannot-second')).toContainText('Another person');
    await expect(c.getByTestId('grn-lines')).toContainText('HELD');
    const receiptUrl = c.url();

    // The clerk may not open the order itself; the owner gives the second key.
    await c.goto(orderUrl.replace(/^https?:\/\/[^/]+/, ''));
    await expect(c.getByRole('heading', { name: 'No access' })).toBeVisible();

    await page.goto('/app/purchasing/receiving');
    await expect(page.getByTestId('queue-second-key')).toBeVisible();
    await page.goto(receiptUrl.replace(/^https?:\/\/[^/]+/, ''));
    await page.getByTestId('grn-confirm').click();
    await page.getByTestId('grn-note').fill('Counted 6 sealed boxes');
    await page.getByTestId('grn-decide').click();
    await expect(page.getByTestId('grn-status')).toHaveText('Posted to stock');
    await expect(page.getByTestId('grn-verifier')).toContainText('Ada Obi');

    // The bins now hold the stock.
    await page.goto('/app/inventory/bins');
    await expect(page.getByTestId('bin-stock')).toContainText('LOCK-01');
    await expect(page.getByTestId('bin-stock')).toContainText('VAULT-A1');
    await page.goto(orderUrl.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByTestId('po-status')).toContainText('Received');
    await clerk.context.close();
  });

  test('a return and a transfer are offered from the list, and goods without an order are booked in one step', async ({ page }) => {
    test.setTimeout(240_000);
    await ownerInApp(page);
    await newItem(page, 'Corked Merlot', '5000281000035');
    await page.goto('/app/purchasing/orders');
    await expect(page.getByTestId('po-new')).toBeVisible();
    await expect(page.getByTestId('po-new-return')).toBeVisible();
    await expect(page.getByTestId('po-new-transfer')).toBeVisible();

    await page.getByTestId('po-new-direct').click();
    await expect(page.getByTestId('po-type')).toHaveValue('DirectConsignment');
    await page.getByTestId('po-supplier-new').click();
    await page.getByTestId('supplier-name').fill('Walk-in Wines');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('po-supplier-name')).toHaveText('Walk-in Wines');
    await page.getByTestId('po-scan').fill('5000281000035');
    await page.getByTestId('po-scan').press('Enter');
    await page.getByTestId('line-qty-0').fill('12');
    await page.getByTestId('line-cost-0').fill('8');
    await expect(page.getByTestId('po-total')).toHaveText('96.00');
    await page.getByTestId('po-book').click();
    await page.getByTestId('po-direct-confirm').click();
    await expect(page.getByTestId('grn-status')).toHaveText('Posted to stock');
    await page.goto('/app/inventory/reports/quantities');
    await expect(page.locator('main')).toContainText('Corked Merlot');
  });

  test('an order that takes a supplier over its credit limit asks for a reason before it is posted', async ({ page }) => {
    test.setTimeout(240_000);
    await ownerInApp(page);
    await newItem(page, 'Campari', '5000281000042');
    await page.goto('/app/purchasing/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('po-supplier-new').click();
    await page.getByTestId('supplier-name').fill('Tight Credit Ltd');
    await page.getByTestId('supplier-limit').fill('100');
    await page.getByTestId('supplier-save').click();
    await page.getByTestId('po-scan').fill('5000281000042');
    await page.getByTestId('po-scan').press('Enter');
    await page.getByTestId('line-qty-0').fill('20');
    await page.getByTestId('line-cost-0').fill('15');
    await expect(page.getByTestId('po-overlimit')).toContainText('over');
    await page.getByTestId('po-post').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('po-overlimit-reason')).toBeVisible();
    await expect(page.getByTestId('po-overlimit-post')).toBeDisabled();
    await page.getByTestId('po-overlimit-reason').fill('Festival weekend stock-up');
    await page.getByTestId('po-overlimit-post').click();
    await expect(page.getByTestId('po-status')).toContainText('Posted');
    await expect(page.getByTestId('po-overlimit-note')).toContainText('Festival weekend stock-up');
  });
});

/** The first line's SKU, or its name when the item has none (the receiving row test ids use the SKU). */
async function skuOrName(page: Page, index: number): Promise<string> {
  const row = page.locator('[data-testid^="rline-"]').nth(index);
  const id = (await row.getAttribute('data-testid')) ?? '';
  return id.replace('rline-', '');
}

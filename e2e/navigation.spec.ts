import { Page, expect, test } from '@playwright/test';
import { newContext, pick, registerViaUi } from './helpers';

/** The menu contract: group, order, label and route of every screen (POS 8, Stock 22, Purchasing 16). */
const POS: [string, string][] = [
  ['Point of Sale', '/app/pos'], ['Start / End of Day', '/app/pos/day-management'], ['Summary Income Report', '/app/pos/reports/summary-income'], ['Daily Sales Report', '/app/pos/reports/daily-sales'],
  ['Staff Sales Report', '/app/pos/reports/staff-sales'], ['Stock Groups Sales Report', '/app/pos/reports/stock-group-sales'], ['Sales Analysis Report', '/app/pos/reports/sales-analysis'], ['Multi-Currency Report', '/app/pos/reports/multi-currency']
];
const STOCK: [string, string][] = [
  ['Add / Modify Stock', '/app/inventory/items'], ['Stock Group Maintenance', '/app/inventory/groups'], ['Global Stock Maintenance', '/app/inventory/global-maintenance'], ['Stock Qty Adjustments', '/app/inventory/adjustments'],
  ['Items Enquiry Report', '/app/inventory/reports/items-enquiry'], ['Stock Transactions Enquiry Report', '/app/inventory/reports/transactions'], ['Stock Quantities Report', '/app/inventory/reports/quantities'],
  ['Selling Prices Report', '/app/inventory/reports/selling-prices'], ['Cost Prices Report', '/app/inventory/reports/cost-prices'], ['Stock Performance Report', '/app/inventory/reports/performance'],
  ['Out of Stock Report', '/app/inventory/reports/out-of-stock'], ['Stock Re-Order Report', '/app/inventory/reports/re-order'], ['Stock Take Report', '/app/inventory/reports/stock-take'],
  ['Stock Value Report', '/app/inventory/reports/stock-value'], ['Items History Report', '/app/inventory/reports/items-history'], ['Stock Labels Printing', '/app/inventory/reports/stock-labels'],
  ['Stock Expiry Report', '/app/inventory/reports/expiry'], ['Web Store Stock Report', '/app/inventory/reports/web-store-stock'], ['Stock Aging Report', '/app/inventory/reports/stock-aging'], ['Bin Locations', '/app/inventory/bins'], ['Stock by Bin Report', '/app/inventory/reports/bin-stock'], ['Serial Numbers Report', '/app/inventory/reports/serial-numbers']
];
const PURCHASING: [string, string][] = [
  ['Purchasing / Purchase Orders', '/app/purchasing/orders'], ['Goods Receiving', '/app/purchasing/receiving'], ['Payments to Suppliers', '/app/purchasing/payments'], ['Add / Modify Suppliers', '/app/purchasing/suppliers'],
  ["Supplier's List Report", '/app/purchasing/reports/suppliers-list'], ['Purchases Report', '/app/purchasing/reports/purchases'], ['Purchase Orders Report', '/app/purchasing/reports/purchase-orders'],
  ['Summary Purchases Report', '/app/purchasing/reports/summary-purchases'], ['Aged Suppliers Report', '/app/purchasing/reports/aged-suppliers'], ["Supplier's Statement of Account", '/app/purchasing/reports/statement-of-account'],
  ['Purchase Analysis Report', '/app/purchasing/reports/purchase-analysis'], ['Back Orders Report', '/app/purchasing/reports/back-orders'], ['Stock On Order Report', '/app/purchasing/reports/stock-on-order'],
  ['Purchases Tax Report', '/app/purchasing/reports/purchases-tax'], ['Purchase Payments Report', '/app/purchasing/reports/purchase-payments'], ['Equivalent Part Numbers Report', '/app/purchasing/reports/equivalent-part-numbers']
];
const GROUPS = [['pos', POS], ['stock', STOCK], ['purchasing', PURCHASING]] as const;

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function expandAll(page: Page) {
  for (const [key] of GROUPS) {
    const header = page.getByTestId(`nav-group-${key}`);
    if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  }
}

async function addPinStaff(page: Page, name: string, roleKey: string, pin = '7391'): Promise<number> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  await page.getByTestId('create-staff').click();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  return Number(await row.locator('td').nth(1).innerText());
}

async function pinSignIn(page: Page, slug: string, code: number, pin = '7391') {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(slug);
  await page.getByTestId('mode-pin').click();
  await page.getByTestId('login-code').fill(String(code));
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/app\/(dashboard|pos)/);
}

async function labelsOf(page: Page, group: string): Promise<string[]> {
  return page.locator(`[data-group-list="${group}"] a span.truncate`).allInnerTexts();
}

test.describe('POS, Stock and Purchasing navigation', () => {
  test('the menu has three separate groups with every entry in the required order', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expandAll(page);

    for (const [key, entries] of GROUPS) expect(await labelsOf(page, key), key).toEqual(entries.map(([label]) => label));
    expect(await page.locator('[data-group-list="pos"] a, [data-group-list="stock"] a, [data-group-list="purchasing"] a').count()).toBe(8 + 22 + 16);

    // Legacy shortcut letters are shown beside the entries that have them.
    await expect(page.locator('[data-nav="stock.report.value"] kbd')).toHaveText('v');
    await expect(page.locator('[data-nav="purchasing.report.equivalent"] kbd')).toHaveText('q');
  });

  test('every menu entry opens its own working screen', async ({ page }) => {
    test.setTimeout(240_000);
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expandAll(page);

    for (const [, entries] of GROUPS) {
      for (const [label, route] of entries) {
        await page.locator(`a.nav-link:has-text("${label}")`).first().click();
        await expect(page, label).toHaveURL(new RegExp(route.replace(/[/-]/g, '\\$&') + '(\\?.*)?$'));
        await expect(page.locator('main h1').first(), label).toBeVisible();
        await expect(page.getByRole('heading', { name: 'No access' }), label).toHaveCount(0);
        await expect(page.getByTestId('report-error'), label).toHaveCount(0);
      }
    }
  });

  test('legacy menu keys work only while focus is inside that menu group', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expandAll(page);

    await page.locator('[data-nav="stock.items"]').focus();
    await page.keyboard.press('v');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/stock-value/);
    await page.keyboard.press('5');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/cost-prices/);

    // The same keys do nothing from the search box, and a purchasing key does not fire from the stock group.
    await page.getByTestId('nav-search').click();
    await page.keyboard.type('v');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/cost-prices/);
    await page.getByTestId('nav-search').fill('');
    await page.locator('[data-nav="stock.items"]').focus();
    await page.keyboard.press('y');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/cost-prices/);

    await page.locator('[data-nav="purchasing.orders"]').focus();
    await page.keyboard.press('y');
    await expect(page).toHaveURL(/\/app\/purchasing\/reports\/purchase-payments/);

    // Arrow keys move through the menu.
    await page.locator('[data-nav="stock.items"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-nav="stock.groups"]')).toBeFocused();

    // Typing in a report's own filter box never navigates.
    await page.goto('/app/inventory/reports/items-enquiry');
    await page.getByTestId('filter-search').fill('vvvv5');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/items-enquiry/);
  });

  test('the menu search finds screens across the groups', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await page.getByTestId('nav-search').fill('serial');
    await expect(page.getByTestId('nav-results')).toContainText('Serial Numbers Report');
    await page.getByTestId('nav-results').getByRole('link', { name: /Serial Numbers Report/ }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/serial-numbers/);
    await expect(page.getByTestId('breadcrumb')).toContainText('Stock');
    await page.getByTestId('nav-search').fill('zzzz-nothing');
    await expect(page.getByTestId('nav-results')).toContainText('No screen matches');
  });

  test('a cashier sees only the selling screens, and typed URLs for the rest are refused', async ({ page, browser }) => {
    const who = await ownerInApp(page);
    const code = await addPinStaff(page, 'Cash Only', 'cashier');

    const staff = await newContext(browser);
    await pinSignIn(staff.page, who.slug, code);
    await expect(staff.page).toHaveURL(/\/app\/dashboard$/);

    await expect(staff.page.getByTestId('nav-group-pos')).toBeVisible();
    expect(await labelsOf(staff.page, 'pos')).toEqual(['Point of Sale', 'Start / End of Day']);
    await expect(staff.page.getByTestId('nav-group-stock')).toHaveCount(0);
    await expect(staff.page.getByTestId('nav-group-purchasing')).toHaveCount(0);
    await expect(staff.page.getByTestId('quick-pos')).toBeVisible();
    await expect(staff.page.getByTestId('quick-stock.items')).toHaveCount(0);

    for (const url of ['/app/pos/reports/summary-income', '/app/pos/reports/staff-sales', '/app/inventory/reports/stock-value', '/app/inventory/reports/cost-prices', '/app/inventory/items',
      '/app/inventory/adjustments', '/app/inventory/global-maintenance', '/app/purchasing/payments', '/app/purchasing/reports/aged-suppliers']) {
      await staff.page.goto(url);
      await expect(staff.page.getByRole('heading', { name: 'No access' }), url).toBeVisible();
    }
    await staff.page.goto('/app/pos/day-management');
    await expect(staff.page.getByRole('heading', { name: 'Start / End of Day' })).toBeVisible();
    await staff.context.close();
  });

  test('a cashier starts and closes a shift; a variance is signed off by a supervisor', async ({ page, browser }) => {
    const who = await ownerInApp(page);
    const cashierCode = await addPinStaff(page, 'Tunde Till', 'cashier');
    const supervisorCode = await addPinStaff(page, 'Sade Super', 'supervisor', '5827');

    const cashier = await newContext(browser);
    await pinSignIn(cashier.page, who.slug, cashierCode);
    await cashier.page.goto('/app/pos/day-management');
    await expect(cashier.page.getByTestId('day-start')).toBeVisible();
    await expect(cashier.page.getByTestId('day-start-btn')).toBeDisabled();            // needs a terminal and a confirmed float
    await cashier.page.getByTestId('day-terminal').fill('Till 1');
    await cashier.page.getByTestId('day-float').fill('100');
    await cashier.page.getByTestId('day-float-confirm').check();
    await cashier.page.getByTestId('day-start-btn').click();

    await expect(cashier.page.getByTestId('day-status')).toHaveText('Open');
    await expect(cashier.page.getByTestId('day-expected')).toContainText('100.00');
    await cashier.page.getByTestId('move-reason').fill('Float top-up');
    await cashier.page.getByTestId('move-amount').fill('25');
    await cashier.page.getByTestId('move-add').click();
    await expect(cashier.page.getByTestId('day-movements')).toContainText('Float top-up');
    await expect(cashier.page.getByTestId('day-expected')).toContainText('125.00');

    await cashier.page.getByTestId('close-count').fill('100');
    await expect(cashier.page.getByTestId('close-variance')).toContainText('short');
    await cashier.page.getByTestId('close-confirm').check();
    await cashier.page.getByTestId('close-btn').click();
    await cashier.page.getByTestId('confirm-ok').click();
    await expect(cashier.page.getByTestId('day-pending')).toBeVisible();
    await expect(cashier.page.getByTestId('shift-summary')).toContainText('Difference');
    await expect(cashier.page.getByTestId('day-queue')).toHaveCount(0);                // a cashier is not a reviewer

    const supervisor = await newContext(browser);
    await pinSignIn(supervisor.page, who.slug, supervisorCode, '5827');
    await supervisor.page.goto('/app/pos/day-management');
    await expect(supervisor.page.getByTestId('day-queue')).toContainText('Tunde Till');
    await supervisor.page.getByRole('button', { name: 'Review' }).first().click();
    await supervisor.page.getByTestId('review-note').fill('Short by a tip-jar mix-up');
    await supervisor.page.getByTestId('review-approve').click();
    await expect(supervisor.page.getByTestId('day-queue')).toHaveCount(0);
    await expect(supervisor.page.getByTestId('day-history')).toContainText('Closed');

    await cashier.context.close();
    await supervisor.context.close();
  });

  test('a shift can be started and a cash movement recorded offline, and both reach the server when the connection returns', async ({ page, browser }) => {
    const who = await ownerInApp(page);
    const code = await addPinStaff(page, 'Offline Ola', 'cashier');

    const cashier = await newContext(browser);
    const p = cashier.page;
    await pinSignIn(p, who.slug, code);
    await p.goto('/app/pos/day-management');
    await expect(p.getByTestId('day-start')).toBeVisible();
    await p.waitForLoadState('networkidle');

    await cashier.context.setOffline(true);
    await p.getByTestId('day-terminal').fill('Till 9');
    await p.getByTestId('day-float').fill('50');
    await p.getByTestId('day-float-confirm').check();
    await p.getByTestId('day-start-btn').click();
    await expect(p.getByTestId('day-status')).toHaveText('Open');
    await expect(p.getByTestId('day-offline')).toBeVisible();
    await p.getByTestId('move-reason').fill('Offline float top-up');
    await p.getByTestId('move-amount').fill('10');
    await p.getByTestId('move-add').click();
    await expect(p.getByTestId('day-movements')).toContainText('Offline float top-up');

    await cashier.context.setOffline(false);
    await expect(p.getByTestId('day-offline')).toHaveCount(0, { timeout: 30000 });
    await p.reload();
    await expect(p.getByTestId('day-status')).toHaveText('Open');
    await expect(p.getByTestId('day-movements')).toContainText('Offline float top-up');
    await expect(p.getByTestId('day-expected')).toContainText('60.00');
    await cashier.context.close();
  });

  test('stock groups, items, adjustments, stock take and labels work end to end', async ({ page }) => {
    test.setTimeout(180_000);
    await ownerInApp(page);

    // Stock groups: create, protect and delete.
    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Spirits');
    await page.getByTestId('group-code').fill('spr');
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Spirits')).toContainText('SPR');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Spirits');
    await page.getByTestId('group-save').click();
    await expect(page.getByRole('alert').filter({ hasText: /exists/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Spare');
    await page.getByTestId('group-save').click();
    await page.getByTestId('group-delete-Spare').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('group-Spare')).toHaveCount(0);

    // Add an item in the group with a barcode and a price; a duplicate barcode is refused.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Whisky');
    await page.getByTestId('item-barcode').fill('4006381333931');
    await page.getByTestId('item-group').selectOption({ label: 'Spirits' });
    await page.getByTestId('item-price').fill('1200');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Whisky')).toContainText('Spirits');
    await expect(page.getByTestId('item-Whisky')).toContainText('1,200.00');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Whisky twin');
    await page.getByTestId('item-barcode').fill('4006381333931');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-form').getByRole('alert').first()).toContainText(/already used/i);
    await page.keyboard.press('Escape');

    // Opening stock goes through an adjustment, which writes a ledger movement.
    await page.goto('/app/inventory/adjustments');
    await page.waitForLoadState('networkidle');                                         // the item list loads after the branch is known
    await pick(page, 'adjust-item', 'Whisky');
    await expect(page.getByTestId('adjust-expected')).toContainText('0');
    await page.getByTestId('adjust-qty').fill('24');
    await expect(page.getByTestId('adjust-result')).toContainText('24');
    await page.getByTestId('adjust-reason').selectOption({ label: 'Count correction' });
    await page.getByTestId('adjust-submit').click();
    await expect(page.getByTestId('adjust-message')).toContainText('Stock was updated');
    await expect(page.getByTestId('adjust-history')).toContainText('Approved');

    await page.goto('/app/inventory/reports/quantities');
    await expect(page.getByTestId('report-table')).toContainText('Whisky');
    await expect(page.getByTestId('report-table')).toContainText('24');
    await expect(page.getByTestId('report-notes')).toContainText('Reserved quantity is not tracked');

    // A stock take: snapshot, count, explain, submit, approve, reconcile once.
    await page.goto('/app/inventory/reports/stock-take');
    await page.getByTestId('take-new').click();
    await page.getByTestId('take-create').click();
    await page.getByTestId('take-start').click();
    await expect(page.getByTestId('take-status')).toHaveText('Counting');
    await page.getByTestId('count-Whisky').fill('20');
    await page.getByTestId('explain-Whisky').fill('A bottle broke');
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('take-status')).toHaveText('Submitted');
    await page.getByTestId('take-approve').click();
    await page.getByTestId('take-decision-confirm').click();
    await expect(page.getByTestId('take-status')).toHaveText('Approved');
    await page.getByTestId('take-reconcile').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('take-status')).toHaveText('Reconciled');
    await expect(page.getByTestId('take-reconcile')).toHaveCount(0);                    // never twice

    await page.goto('/app/inventory/reports/quantities');
    await expect(page.getByTestId('report-table')).toContainText('20');
    await page.goto('/app/inventory/reports/transactions');
    await expect(page.getByTestId('report-table')).toContainText('AuditCorrection');
    await expect(page.getByTestId('report-table')).toContainText('Stock take #1');

    // Labels: a real barcode is drawn, and the screen never claims anything was printed.
    await page.goto('/app/inventory/reports/stock-labels');
    await page.waitForLoadState('networkidle');
    await pick(page, 'label-item', 'Whisky');
    await page.getByTestId('label-copies').fill('2');
    await page.getByTestId('label-add').click();
    await page.getByTestId('label-price').check();
    await page.getByTestId('label-preview').click();
    await expect(page.getByTestId('label-sheet').locator('svg')).toHaveCount(2);
    await expect(page.getByTestId('label-sheet')).toContainText('4006381333931');
    await expect(page.getByTestId('label-sheet')).toContainText('1200.00');
    await expect(page.getByTestId('label-print')).toBeEnabled();
    await expect(page.getByTestId('label-printed-note')).toHaveCount(0);
  });

  test('reports show real sales, keep their filters in the address, export and print', async ({ page }) => {
    test.setTimeout(150_000);
    await ownerInApp(page);
    await page.goto('/app/settings/operations');
    await page.getByTestId('seed-demo').click();
    await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);

    await page.goto('/app/pos');
    await expect(page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Report bill');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Demo Canned Beans').click();
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });

    await page.goto('/app/pos/reports/daily-sales');
    await expect(page.getByTestId('report-title')).toHaveText('Daily Sales Report');
    await expect(page.getByTestId('report-table')).toContainText('1');
    await expect(page.getByTestId('report-totals')).toBeVisible();
    await expect(page.getByTestId('report-notes')).toContainText('Gross sales');
    await expect(page.getByTestId('report-applied')).toContainText('Period');

    // Filters live in the address bar and survive a reload.
    await page.getByTestId('filter-view').selectOption('hour');
    await page.getByTestId('filter-apply').click();
    await expect(page).toHaveURL(/type=hour/);
    await page.reload();
    await expect(page.getByTestId('filter-view')).toHaveValue('hour');
    await expect(page.getByTestId('report-table')).toContainText(':00');

    // Reports with no matching rows say so; sort headers change the sort; paging controls are present.
    await page.goto('/app/pos/reports/staff-sales?from=2020-01-01&to=2020-01-02');
    await expect(page.getByTestId('report-empty')).toBeVisible();
    await page.goto('/app/inventory/reports/items-enquiry');
    await page.getByRole('button', { name: /^Item/ }).first().click();
    await expect(page).toHaveURL(/sort=name|sort=sku/);
    await expect(page.getByTestId('page-size')).toBeVisible();

    // Export and print are separate from viewing: the owner holds both.
    await page.goto('/app/pos/reports/summary-income');
    const download = page.waitForEvent('download');
    await page.getByTestId('report-export').click();
    expect((await download).suggestedFilename()).toMatch(/summary-income.*\.csv$/);
    await expect(page.getByTestId('report-print')).toBeEnabled();

    // An invalid range is explained by the server, not swallowed.
    await page.goto('/app/pos/reports/daily-sales?from=2026-02-10&to=2026-02-01');
    await expect(page.getByTestId('report-error')).toContainText(/before the start/i);

    // A report that needs a choice asks for it instead of failing.
    await page.goto('/app/inventory/reports/items-history');
    await expect(page.getByTestId('report-needs-input')).toContainText('Choose an item');

    // An integration that does not exist is reported honestly.
    await page.goto('/app/inventory/reports/web-store-stock');
    await expect(page.getByTestId('report-integration')).toContainText('No integration is configured');
  });

  test('purchasing: suppliers, payments and reports', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/purchasing/suppliers');
    await page.getByTestId('supplier-new').click();
    await page.getByTestId('supplier-name').fill('Acme Wholesale');
    await page.getByTestId('supplier-terms').fill('45');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('supplier-Acme Wholesale')).toContainText('45');

    await page.goto('/app/purchasing/payments');
    await expect(page.getByTestId('pay-balances')).toContainText('Nothing owed');
    await page.goto('/app/purchasing/reports/aged-suppliers');
    await expect(page.getByTestId('report-notes')).toContainText('no supplier invoice register');
    await page.goto('/app/purchasing/reports/suppliers-list');
    await expect(page.getByTestId('report-table')).toContainText('Acme Wholesale');
    await page.goto('/app/purchasing/orders');
    await expect(page.getByRole('heading', { name: 'Purchasing / Purchase Orders' })).toBeVisible();
  });

  test('on a phone the menu is a drawer and report pages do not scroll sideways', async ({ page }) => {
    await ownerInApp(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/app/pos/reports/daily-sales');
    await expect(page.getByTestId('main-nav').first()).toBeHidden();
    await page.getByTestId('nav-open').click();
    const drawer = page.getByTestId('nav-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByTestId('nav-group-stock').click();
    await drawer.locator('[data-nav="stock.report.quantities"]').click();
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/quantities/);
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);                        // choosing a screen closes the drawer

    await page.goto('/app/inventory/reports/stock-value');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

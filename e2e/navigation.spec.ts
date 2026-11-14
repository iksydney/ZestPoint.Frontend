import { Page, expect, test } from '@playwright/test';
import { newContext, pick, registerViaUi } from './helpers';

/** The menu contract: group, order, label and route of every screen (POS 9, Stock 22, Purchasing 16; Bar Orders is offered only to a company that uses the bar man method). */
/** The menu as the owner of a new company sees it: working screens by area, in order, each area's reports behind one Reports entry. */
const AREAS: [string, string[], number][] = [
  ['sell', ['Point of Sale', 'Start / End of Day'], 7],
  ['customers', ['Customers', 'Laybys', 'Sales Back Orders'], 2],
  ['stock', ['Stock Overview', 'Items', 'Stock Groups', 'Catalogue', 'Adjustments', 'Bulk Changes', 'Bin Locations', 'Labels', 'Consignment Out'], 17],
  ['purchasing', ['Purchase Orders', 'Goods Receiving', 'Suppliers', 'Supplier Payments'], 12],
  ['finance', ['Chart of Accounts'], 3],
  ['admin', ['Staff', 'Branches', 'Settings', 'Branding', 'Subscription', 'Support'], 0]
];

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function expandAll(page: Page) {
  for (const [key] of AREAS) {
    const header = page.getByTestId(`nav-group-${key}`);
    if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  }
}

async function addPinStaff(page: Page, name: string, roleKey: string, pin = '7391'): Promise<string> {
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

async function pinSignIn(page: Page, slug: string, code: string, pin = '7391') {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(slug);
  await page.getByTestId('mode-pin').click();
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/app\/(dashboard|pos)/);
}

async function labelsOf(page: Page, group: string): Promise<string[]> {
  return page.locator(`[data-group-list="${group}"] a span.truncate`).allInnerTexts();
}

test.describe('Navigation', () => {
  test('the menu shows working screens grouped by job, and each area keeps its reports on one page', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expandAll(page);

    for (const [key, screens, reports] of AREAS) {
      expect(await labelsOf(page, key), key).toEqual(reports > 0 ? [...screens, 'Reports'] : screens);
      if (reports > 0) await expect(page.locator(`[data-nav="reports.${key}"] .nav-count`), key).toHaveText(String(reports));
    }
    // No report is listed in the menu itself: the menu is the short list of places to work.
    await expect(page.locator('[data-testid="main-nav"] [data-nav*=".report."]')).toHaveCount(0);
    expect(await page.locator('[data-testid="main-nav"] a.nav-link').count()).toBeLessThanOrEqual(32);

    // An area can be folded away, and the choice is kept.
    await page.getByTestId('nav-group-purchasing').click();
    await expect(page.locator('[data-group-list="purchasing"]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('nav-group-purchasing')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('nav-group-purchasing').click();

    // The Reports page of an area lists each report with a line on what it shows, and can be narrowed by typing.
    await page.locator('[data-nav="reports.sell"]').click();
    await expect(page).toHaveURL(/\/app\/reports\/sell$/);
    await expect(page.getByRole('heading', { name: 'Sell reports' })).toBeVisible();
    await expect(page.getByTestId('hub-list').locator('a')).toHaveCount(7);
    await expect(page.locator('[data-testid="hub-list"] [data-nav="pos.report.voids"]')).toContainText('who authorised it');
    await expect(page.locator('[data-nav="reports.sell"]')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('hub-filter').fill('daily');
    await expect(page.getByTestId('hub-list').locator('a')).toHaveCount(1);
    await page.locator('[data-testid="hub-list"] [data-nav="pos.report.daily"]').click();
    await expect(page).toHaveURL(/\/app\/pos\/reports\/daily-sales/);
    // On a report, the area's Reports entry stays marked and the breadcrumb leads back to the list.
    await expect(page.locator('[data-nav="reports.sell"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('breadcrumb')).toContainText('Sell');
    await page.getByTestId('breadcrumb').getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/app\/reports\/sell$/);

    // An area that does not exist, or has nothing the person may open, says so.
    await page.goto('/app/reports/nowhere');
    await expect(page.getByTestId('hub-none')).toBeVisible();
  });

  test('every working screen in the menu and every report on the Reports pages opens', async ({ page }) => {
    test.setTimeout(300_000);
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expandAll(page);

    const check = async (what: string) => {
      await expect(page.locator('main h1').first(), what).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No access' }), what).toHaveCount(0);
      await expect(page.getByTestId('report-error'), what).toHaveCount(0);
    };

    const screens = await page.locator('[data-testid="main-nav"] a.nav-link').evaluateAll((links) => links.map((a) => [a.getAttribute('data-nav')!, a.getAttribute('href')!]));
    expect(screens.length).toBeGreaterThan(25);
    for (const [key, href] of screens) {
      await page.locator(`[data-testid="main-nav"] [data-nav="${key}"]`).click();
      await expect(page, key).toHaveURL(new RegExp(href.replace(/[/-]/g, '\\$&') + '(\\?.*)?$'));
      await check(key);
    }

    let reports = 0;
    for (const [area, , count] of AREAS) {
      if (count === 0) continue;
      await page.goto(`/app/reports/${area}`);
      await expect(page.getByTestId('hub-list').locator('a'), area).toHaveCount(count);
      const cards = await page.getByTestId('hub-list').locator('a').evaluateAll((links) => links.map((a) => [a.getAttribute('data-nav')!, a.getAttribute('href')!]));
      expect(cards.length, area).toBe(count);
      for (const [key, href] of cards) {
        await page.goto(href);
        await expect(page, key).toHaveURL(new RegExp(href.replace(/[/-]/g, '\\$&') + '(\\?.*)?$'));
        await check(key);
        reports++;
      }
    }
    expect(reports).toBe(41);
  });

  test('search (Ctrl+K) reaches any screen or report, by its old name too, and the keyboard moves through the menu', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('palette')).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('palette-input')).toBeFocused();
    await page.keyboard.type('serial');
    await expect(page.getByTestId('palette-results')).toContainText('Serial Numbers Report');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/serial-numbers/);
    await expect(page.getByTestId('palette')).toHaveCount(0);
    await expect(page.getByTestId('breadcrumb')).toContainText('Stock');
    await expect(page.getByTestId('breadcrumb')).toContainText('Reports');

    // The Search box in the menu opens the same thing; a screen is found by the name it used to have.
    await page.getByTestId('nav-search').click();
    await page.getByTestId('palette-input').fill('add / modify stock');
    await expect(page.locator('[data-testid="palette-results"] [data-nav="stock.items"]')).toContainText('Items');
    await page.getByTestId('palette-input').fill('purch ord');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="palette-results"] [data-nav="purchasing.orders"]').click();
    await expect(page).toHaveURL(/\/app\/purchasing\/orders$/);

    // Nothing found says so; Escape closes without going anywhere.
    await page.keyboard.press('Control+k');
    await page.getByTestId('palette-input').fill('zzzz-nothing');
    await expect(page.getByTestId('palette-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('palette')).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/purchasing\/orders$/);

    // Ctrl+K works while typing in a field of the page; ordinary typing in a field never navigates.
    await page.goto('/app/inventory/reports/items-enquiry');
    await page.getByTestId('filter-search').fill('vvvv5');
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/items-enquiry/);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('palette-input')).toBeFocused();
    await page.keyboard.press('Escape');

    // Arrow keys move through the menu.
    await expandAll(page);
    await page.locator('[data-nav="stock.items"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-nav="stock.groups"]')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-nav="inventory"]')).toBeFocused();
  });

  test('a cashier sees only the selling screens, and typed URLs for the rest are refused', async ({ page, browser }) => {
    const who = await ownerInApp(page);
    const code = await addPinStaff(page, 'Cash Only', 'cashier');

    const staff = await newContext(browser);
    await pinSignIn(staff.page, who.slug, code);
    await expect(staff.page).toHaveURL(/\/app\/dashboard$/);

    await expect(staff.page.getByTestId('nav-group-sell')).toBeVisible();
    expect(await labelsOf(staff.page, 'sell')).toEqual(['Point of Sale', 'Start / End of Day']);
    expect(await labelsOf(staff.page, 'customers')).toEqual(['Customers', 'Laybys', 'Sales Back Orders', 'Reports']);   // till staff look after customers, laybys and back orders
    await expect(staff.page.locator('[data-nav="stock.items"]')).toHaveCount(0);
    await expect(staff.page.getByTestId('nav-group-purchasing')).toHaveCount(0);
    await expect(staff.page.getByTestId('nav-group-finance')).toHaveCount(0);
    await expect(staff.page.getByTestId('nav-group-admin')).toHaveCount(0);
    // Search offers them nothing more than the menu does.
    await staff.page.keyboard.press('Control+k');
    await staff.page.getByTestId('palette-input').fill('stock value');
    await expect(staff.page.getByTestId('palette-empty')).toBeVisible();
    await staff.page.keyboard.press('Escape');
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
    await expect(cashier.page.getByTestId('day-start-btn')).toBeDisabled();            // needs a confirmed float; the till is assigned, not typed
    await cashier.page.getByTestId('day-float').fill('100');
    await cashier.page.getByTestId('day-float-confirm').check();
    await cashier.page.getByTestId('day-start-btn').click();

    await expect(cashier.page.getByTestId('day-status')).toHaveText('Open');
    await expect(cashier.page.getByTestId('day-till')).toHaveText('Till 1');               // first to start at the branch
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
    await drawer.locator('[data-nav="reports.stock"]').click();
    await expect(page).toHaveURL(/\/app\/reports\/stock$/);
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);                        // choosing a screen closes the drawer
    await page.locator('[data-testid="hub-list"] [data-nav="stock.report.quantities"]').click();
    await expect(page).toHaveURL(/\/app\/inventory\/reports\/quantities/);
    await page.getByTestId('header-search').click();                                    // search is in the header on a phone
    await expect(page.getByTestId('palette-input')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/app/inventory/reports/stock-value');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

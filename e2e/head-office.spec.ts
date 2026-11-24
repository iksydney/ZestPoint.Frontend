import { Page, expect, test } from '@playwright/test';
import { registerViaUi, openPos } from './helpers';

/**
 * Head office (design of 2026-11-15): every branch side by side in an overview, a comparison of one measure over time with a ranking and
 * a table view, branch-by-branch views of three reports, and the Head Office section of the menu.
 */

async function ownerInApp(page: Page) {
  await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

async function newItem(page: Page, name: string, price: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

async function sell(page: Page, label: string, item: string, count: number) {
  await openPos(page);
  await expect(page.getByTestId('product-grid')).toContainText(item);
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  for (let i = 0; i < count; i++) await page.getByTestId(`product-${item}`).click();
  await page.getByTestId('pay').click();
  await page.getByTestId('pay-confirm').click();
  await expect(page.getByTestId('bill-status')).toHaveText('Paid');
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Head office', () => {
  test('the Head Office section, the overview, the comparison with its chart, ranking and table, and the by-branch views', async ({ page }) => {
    test.slow();
    await ownerInApp(page);

    await page.goto('/app/settings/branches');
    await page.getByTestId('add-branch').click();
    await page.getByTestId('branch-name').fill('Annex');
    await page.getByTestId('branch-code').fill('ANX');
    await page.getByTestId('save-branch').click();
    await expect(page.getByTestId('branch-ANX')).toBeVisible();
    await newItem(page, 'Lager', '1000');
    await sell(page, 'Head office bill', 'Lager', 2);                    // 2,000 at the main branch; the annex sold nothing

    // The Head Office section of the menu: its Reports (the overview and the comparison) and a Set-up page that holds Prices and Menus.
    await page.goto('/app/dashboard');
    const group = page.getByTestId('nav-group-head');
    if ((await group.getAttribute('aria-expanded')) === 'false') await group.click();
    await expect(page.locator('[data-group-list="head"] a span.truncate')).toHaveText(['Set-up', 'Reports']);
    await expect(page.locator('[data-nav="reports.head"] .nav-count')).toHaveText('3');
    await page.locator('[data-nav="setup.head"]').click();
    await expect(page.locator('[data-testid="hub-list"] [data-nav="stock.prices"]')).toBeVisible();

    // Overview: one row for each branch, with the share, and the total at the bottom.
    await page.locator('[data-nav="reports.head"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="head.report.overview"]').click();
    await expect(page.getByTestId('report-title')).toHaveText('Head Office Overview');
    const table = page.getByTestId('report-table');
    await expect(table).toContainText('Main branch');
    await expect(table).toContainText('Annex');
    await expect(table).toContainText('2,000.00');
    await expect(page.getByTestId('report-totals')).toContainText('All branches');
    await expect(page.getByTestId('report-totals')).toContainText('100%');

    // Comparison: both branches are drawn and listed, the main one first, and the same figures are in the table view.
    await page.locator('[data-nav="reports.head"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="head.report.compare"]').click();
    await expect(page.getByTestId('cmp-title')).toHaveText('Branch Comparison');
    await expect(page.getByTestId('cmp-chart')).toBeVisible();
    await expect(page.getByTestId('cmp-legend-item')).toHaveText(['Annex', 'Main branch']);
    await expect(page.getByTestId('cmp-line-Main branch')).toBeVisible();
    await expect(page.getByTestId('cmp-line-Annex')).toBeVisible();
    await expect(page.locator('[data-testid="cmp-ranking"] li').first()).toContainText('Main branch');
    await expect(page.getByTestId('cmp-rank-Main branch')).toContainText('2,000.00');
    await expect(page.getByTestId('cmp-rank-Annex')).toContainText('0.00');
    await page.getByTestId('cmp-table-details').locator('summary').click();
    await expect(page.getByTestId('cmp-table')).toContainText('2,000.00');

    // Reading the chart with the keyboard shows a tooltip with each branch's figure.
    await page.getByTestId('cmp-chart').focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('cmp-tooltip')).toContainText('Main branch');

    // Drawing one branch only: the other is gone from the legend and the chart.
    await page.getByTestId('cmp-branch-Annex').check();
    await page.getByTestId('cmp-apply').click();
    await expect(page.getByTestId('cmp-applied')).toContainText('1 branch drawn');
    await expect(page.getByTestId('cmp-line-Main branch')).toHaveCount(0);
    await page.getByTestId('cmp-branch-Annex').uncheck();

    // Another measure, and top items.
    await page.getByTestId('cmp-measure').selectOption('bills');
    await page.getByTestId('cmp-apply').click();
    await expect(page.getByTestId('cmp-chart-title')).toHaveText('Bills by branch');
    await page.getByTestId('cmp-measure').selectOption('top_items');
    await page.getByTestId('cmp-apply').click();
    await expect(page.getByTestId('cmp-chart')).toHaveCount(0);
    await expect(page.getByTestId('cmp-top-Main branch')).toContainText('Lager');
    await expect(page.getByTestId('cmp-top-Main branch')).toContainText('2,000.00');
    await expect(page.getByTestId('cmp-top-Annex')).toContainText('Nothing sold');

    // Summary income, branch by branch, and the scope is said in words on every branch-aware report.
    await page.goto('/app/pos/reports/summary-income');
    await expect(page.getByTestId('report-scope')).toHaveText('All my branches');
    await page.getByTestId('filter-view').selectOption('branch');
    await page.getByTestId('filter-apply').click();
    await expect(page.getByTestId('report-table')).toContainText('Main branch');
    await expect(page.getByTestId('report-totals')).toContainText('All branches');
    await expect(page.getByTestId('report-totals')).toContainText('2,000.00');
  });
});

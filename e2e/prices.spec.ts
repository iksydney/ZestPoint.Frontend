import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * Prices and menus (design of 2026-11-15, head office): a price per branch with its source, bulk changes now or from a date, price lists with
 * the branches that use them, what a branch sells, scheduled changes with a history, and the company setting for branch managers.
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

const money = (cell: string) => cell.replace(/\s+/g, ' ');

test.describe('Prices and menus', () => {
  test('a price per branch, a price list, a branch that does not sell something, a scheduled change and its history', async ({ page }) => {
    test.slow();
    await ownerInApp(page);

    // A second branch, and two items.
    await page.goto('/app/settings/branches');
    await page.getByTestId('add-branch').click();
    await page.getByTestId('branch-name').fill('Annex');
    await page.getByTestId('branch-code').fill('ANX');
    await page.getByTestId('save-branch').click();
    await expect(page.getByTestId('branch-ANX')).toBeVisible();
    await newItem(page, 'Lager', '1000');
    await newItem(page, 'Cola', '500');

    // The screen is behind Stock > Set-up, and shows each item at each branch.
    await page.locator('[data-nav="setup.stock"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="stock.prices"]').click();
    await expect(page.getByTestId('prices-table')).toBeVisible();
    await expect(page.getByTestId('price-row-Lager')).toBeVisible();                             // the table shows before its rows arrive
    const headers = await page.locator('[data-testid="prices-table"] thead th').allInnerTexts();
    const main = headers.slice(3, -1).find((h) => h.trim() !== 'Annex')!.trim();
    await expect(page.getByTestId(`price-cell-Lager-${main}`)).toContainText('1,000.00');
    await expect(page.getByTestId('prices-readonly')).toHaveCount(0);                          // the owner is head office

    // A price for one branch: the Annex pays 900, the main branch is untouched, and the grid says where it comes from.
    await page.getByTestId('price-select-Lager').check();
    await page.getByTestId('prices-change').click();
    await page.getByTestId('pd-scope').selectOption('branch');
    await page.getByTestId('pd-branch').selectOption({ label: 'Annex' });
    await page.getByTestId('pd-value').fill('900');
    await page.getByTestId('pd-apply').click();
    const annexLager = page.getByTestId('price-cell-Lager-Annex');
    await expect(annexLager).toContainText('900.00');
    await expect(annexLager).toHaveAttribute('data-source', 'branch');
    await expect(page.getByTestId(`price-cell-Lager-${main}`)).toContainText('1,000.00');

    // The company price, by a percentage: it reaches every branch with no price of its own, and not the Annex's Lager.
    await page.getByTestId('price-select-Cola').check();
    await page.getByTestId('prices-change').click();
    await page.getByTestId('pd-scope').selectOption('company');
    await page.getByTestId('pd-mode').selectOption('percent');
    await page.getByTestId('pd-value').fill('10');
    await page.getByTestId('pd-apply').click();
    await expect(page.getByTestId(`price-cell-Cola-${main}`)).toContainText('550.00');
    await expect(page.getByTestId('price-cell-Cola-Annex')).toContainText('550.00');

    // A price below nothing is refused with the reason, and nothing changes.
    await page.getByTestId('price-select-Cola').check();
    await page.getByTestId('prices-change').click();
    await page.getByTestId('pd-scope').selectOption('branch');
    await page.getByTestId('pd-branch').selectOption({ label: 'Annex' });
    await page.getByTestId('pd-value').fill('-5');
    await page.getByTestId('pd-apply').click();
    await expect(page.getByTestId('pd-error')).toContainText('less than nothing');
    await page.getByTestId('change-form').getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('price-select-Cola').uncheck();

    // A price list for the Annex that holds a price for Cola.
    await page.getByTestId('prices-tab-lists').click();
    await expect(page.getByTestId('lists-empty')).toBeVisible();
    await page.getByTestId('list-new').click();
    await page.getByTestId('list-name').fill('Happy hour');
    await page.getByTestId('list-save').click();
    await expect(page.getByTestId('list-row-Happy hour')).toContainText('Not used by any branch yet');
    await page.getByTestId('prices-tab-prices').click();
    await page.getByTestId('price-select-Cola').check();
    await page.getByTestId('prices-change').click();
    await page.getByTestId('pd-scope').selectOption('list');
    await page.getByTestId('pd-list').selectOption({ label: 'Happy hour' });
    await page.getByTestId('pd-value').fill('400');
    await page.getByTestId('pd-apply').click();
    await expect(page.getByTestId('price-cell-Cola-Annex')).toContainText('550.00');             // not used by the Annex yet
    await page.getByTestId('prices-tab-lists').click();
    await page.getByTestId('list-branches-Happy hour').click();
    await page.getByTestId('la-use-Annex').check();
    await page.getByTestId('la-save').click();
    await expect(page.getByTestId('list-row-Happy hour')).toContainText('Used at Annex');
    await page.getByTestId('prices-tab-prices').click();
    await expect(page.getByTestId('price-cell-Cola-Annex')).toContainText('400.00');
    await expect(page.getByTestId('price-cell-Cola-Annex')).toHaveAttribute('data-source', 'list');
    await expect(page.getByTestId('price-cell-Cola-Annex')).toContainText('Happy hour');
    await expect(page.getByTestId(`price-cell-Cola-${main}`)).toContainText('550.00');

    // The Annex stops selling Lager: marked in the grid, and sold again when switched back.
    await page.getByTestId('price-select-Lager').check();
    await page.getByTestId('prices-off').click();
    await page.getByTestId('sell-branch').selectOption({ label: 'Annex' });
    await page.getByTestId('sell-apply').click();
    await expect(page.getByTestId('price-cell-Lager-Annex')).toHaveAttribute('data-off', 'true');
    await expect(page.getByTestId('price-cell-Lager-Annex').getByTestId('price-off')).toHaveText('not sold');
    await expect(page.getByTestId(`price-cell-Lager-${main}`)).toHaveAttribute('data-off', 'false');
    await page.getByTestId('price-select-Lager').check();
    await page.getByTestId('prices-on').click();
    await page.getByTestId('sell-branch').selectOption({ label: 'Annex' });
    await page.getByTestId('sell-apply').click();
    await expect(page.getByTestId('price-cell-Lager-Annex')).toHaveAttribute('data-off', 'false');

    // A change for tomorrow waits under Scheduled changes, and can be cancelled before it starts.
    const tomorrow = new Date(Date.now() + 26 * 3_600_000);
    const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T${String(tomorrow.getHours()).padStart(2, '0')}:${String(tomorrow.getMinutes()).padStart(2, '0')}`;
    await page.getByTestId('price-select-Lager').check();
    await page.getByTestId('prices-change').click();
    await page.getByTestId('pd-scope').selectOption('branch');
    await page.getByTestId('pd-branch').selectOption({ label: 'Annex' });
    await page.getByTestId('pd-value').fill('950');
    await page.getByTestId('pd-from').fill(local);
    await page.getByTestId('pd-reason').fill('Weekend menu');
    await page.getByTestId('pd-apply').click();
    await expect(page.getByTestId('price-cell-Lager-Annex')).toContainText('900.00');            // not yet
    await page.getByTestId('prices-tab-pending').click();
    const row = page.getByTestId('pending-row-Lager');
    await expect(row).toContainText('950.00');
    await expect(row).toContainText('Annex');
    await row.getByTestId('pending-cancel-Lager').click();
    await expect(page.getByTestId('pending-empty')).toBeVisible();

    // The history says what is in force, and the cancelled one is there too.
    await page.getByTestId('prices-tab-prices').click();
    await page.getByTestId('price-history-Lager').click();
    const history = page.getByTestId('price-history');
    await expect(history.locator('tr[data-status="in force"]')).toContainText('900.00');
    await expect(history.locator('tr[data-status="cancelled"]')).toContainText('950.00');
    await page.keyboard.press('Escape');

    // The company's choice about branch managers is a setting, and it is kept.
    await page.goto('/app/settings/operations');
    await expect(page.getByTestId('branch-prices')).not.toBeChecked();
    await page.getByTestId('branch-prices').check();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');
    await page.reload();
    await expect(page.getByTestId('branch-prices')).toBeChecked();

    // The main branch's till still charges the company price.
    await page.goto('/app/pos');
    await expect(page.getByTestId('product-Lager')).toContainText('1,000.00');
    expect(money(await page.getByTestId('product-Cola').innerText())).toContain('550.00');
  });
});

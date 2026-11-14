import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * The ledger: a ready-made list of accounts, entries worked out from what happened (never typed), and the accounts an item's sales
 * and stock go to chosen on the stock group or the stock card.
 */

async function ownerInApp(page: Page) {
  await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

test.describe('Ledger', () => {
  test('the account list is ready-made, can be added to, and a stock group and a stock card point at accounts', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/ledger/accounts');
    await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
    await expect(page.getByTestId('account-4000')).toContainText('Sales');
    await expect(page.getByTestId('account-4000')).toContainText('system');
    await expect(page.getByTestId('account-1200')).toContainText('Stock');
    await expect(page.getByTestId('ledger-status')).toContainText('Up to date');

    // A new income account; a code already used is refused by the server.
    await page.getByTestId('account-new').click();
    await page.getByTestId('account-code').fill('4000');
    await page.getByTestId('account-name').fill('Food sales');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('error-code')).toContainText('already has that code');
    await page.getByTestId('account-code').fill('4100');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('account-4100')).toContainText('Food sales');
    await expect(page.getByTestId('balance-4100')).toHaveText('0.00');

    // A system account keeps its kind and cannot be switched off, but can be renamed.
    await page.getByTestId('account-edit-4000').click();
    await expect(page.getByTestId('account-type')).toBeDisabled();
    await expect(page.getByTestId('account-active')).toBeDisabled();
    await page.getByTestId('account-name').fill('Bar sales');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('account-4000')).toContainText('Bar sales');

    // The stock group says where its items' sales go; the stock card can say otherwise.
    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Food');
    await page.getByTestId('group-sales-ac').selectOption({ label: '4100 Food sales' });
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Food')).toBeVisible();
    await page.getByTestId('group-edit-Food').click();
    await expect(page.getByTestId('group-sales-ac').locator('option:checked')).toHaveText('4100 Food sales');
    await page.keyboard.press('Escape');

    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Pie');
    await page.getByTestId('item-price').fill('500');
    await expect(page.getByTestId('item-sales-ac').locator('option:checked')).toHaveText('As the stock group says');
    await page.getByTestId('item-sales-ac').selectOption({ label: '4000 Bar sales' });
    await page.getByTestId('item-save').click();
    await page.getByTestId('item-edit-Pie').click();
    await expect(page.getByTestId('item-sales-ac').locator('option:checked')).toHaveText('4000 Bar sales');
    await page.getByTestId('sc-close').click();

    // The reports open from the menu and the trial balance is in balance (there is nothing posted yet for a new company).
    await page.goto('/app/ledger/reports/trial-balance');
    await expect(page.getByRole('heading', { name: 'Trial Balance' })).toBeVisible();
    await expect(page.getByText('In balance')).toBeVisible();
    await page.locator('[data-nav="reports.finance"]').click();                            // the three ledger reports are on the Finance reports page
    await expect(page.locator('[data-testid="hub-list"] [data-nav="ledger.report.journal"]')).toHaveCount(1);
    await page.goto('/app/ledger/reports/profit-and-loss');
    await expect(page.getByRole('heading', { name: 'Profit and Loss' })).toBeVisible();

    // Phone width: the accounts table scrolls inside its card and the page does not scroll sideways.
    await page.goto('/app/ledger/accounts');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('account-1000')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

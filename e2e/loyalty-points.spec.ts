import { Page, expect, test } from '@playwright/test';
import { PASSWORD, registerViaUi } from './helpers';

/**
 * Spending loyalty points (enterprise programme, piece 9): the company says what a point is worth, a customer earns points, and then pays part of a bill with them: first
 * with a supervisor's details (the customer has no code yet), then with their own code, set at the till. The Customers screen and the Loyalty Points Report show it.
 */

async function newBill(page: Page, label: string, units: number): Promise<void> {
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  for (let i = 0; i < units; i++) await page.getByTestId('product-Soap').click();
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Spending loyalty points', () => {
  test('points pay part of a bill with a supervisor first and the customers own code after, and the report shows who took them', async ({ page }) => {
    test.slow();
    const who = await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);

    // The company says what a point is worth (2.00) and the least that may be spent at once (10 points).
    await page.goto('/app/settings/operations');
    await expect(page.getByTestId('loyalty-section')).toBeVisible();
    await page.getByTestId('loyalty-value').fill('2');
    await page.getByTestId('loyalty-least').fill('10');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');

    // Soap is 1,000 and earns 50 points.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Soap');
    await page.getByTestId('item-price').fill('1000');
    await page.getByTestId('item-points').fill('50');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Soap')).toBeVisible();

    // Two soaps for Ada, paid in cash: 100 points.
    await page.goto('/app/pos');
    await newBill(page, 'First', 2);
    await page.getByTestId('bill-customer-btn').click();
    await page.getByTestId('cust-search').fill('0803');
    await expect(page.getByTestId('cust-none')).toBeVisible();
    await page.getByTestId('cust-new-name').fill('Ada Obi');
    await page.getByTestId('cust-new-phone').fill('0803 555 0101');
    await page.getByTestId('cust-add').click();
    await expect(page.getByTestId('bill-customer')).toContainText('Ada Obi');
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-tendered').fill('2000');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('bill-customer')).toContainText('100 from this bill');

    // Three soaps for Ada. She has 100 points, worth 200.00. With no code of her own, a supervisor must allow it.
    await newBill(page, 'Second', 3);
    await page.getByTestId('bill-customer-btn').click();
    await page.getByTestId('cust-search').fill('5550101');
    await page.getByTestId('cust-pick-Ada Obi').click();
    await expect(page.getByTestId('bill-customer')).toContainText('100 points');
    await page.getByTestId('pay').click();
    await page.getByTestId('method-Points').click();
    await page.getByTestId('pay-amount').fill('200');
    await expect(page.getByTestId('points-balance')).toContainText('Ada Obi has 100 points');
    await expect(page.getByTestId('points-using')).toContainText('Using 100 points');
    await expect(page.getByTestId('points-no-code')).toBeVisible();
    await expect(page.getByTestId('pay-confirm')).toBeDisabled();                       // nobody has allowed it yet
    await page.getByTestId('auth-mode-password').click();
    await page.getByTestId('auth-email').fill(who.email);
    await page.getByTestId('auth-password').fill('not-the-password');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('pay-error')).toBeVisible();                           // a wrong password is refused, nothing is spent
    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-customer')).toContainText('100 used on this bill');
    await expect(page.getByTestId('bill-customer')).toContainText('0 points');

    // The rest in cash: 140 points are earned on the 2,800 paid in money, not on the 200 paid in points.
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-tendered').fill('2800');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('bill-customer')).toContainText('140 from this bill');

    // One more soap. Ada sets a code of her own at the till, typed twice, and spends 50 points with it.
    await newBill(page, 'Third', 1);
    await page.getByTestId('bill-customer-btn').click();
    await page.getByTestId('cust-search').fill('5550101');
    await page.getByTestId('cust-pick-Ada Obi').click();
    await page.getByTestId('pay').click();
    await page.getByTestId('method-Points').click();
    await page.getByTestId('pay-amount').fill('100');
    await page.getByTestId('points-code-toggle').click();
    await page.getByTestId('points-new-code').fill('4826');
    await page.getByTestId('points-new-code-again').fill('4827');
    await page.getByTestId('points-code-save').click();
    await expect(page.getByTestId('points-code-error')).toContainText('not the same');
    await page.getByTestId('points-new-code-again').fill('4826');
    await page.getByTestId('points-code-save').click();
    await expect(page.getByTestId('points-code')).toBeVisible();                         // the box now asks for her code, not a supervisor
    await expect(page.getByTestId('points-no-code')).toHaveCount(0);
    await expect(page.getByTestId('pay-confirm')).toBeDisabled();
    await page.getByTestId('points-code').fill('1111');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('pay-error')).toContainText('2 tries left');
    await page.getByTestId('points-code').fill('4826');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-customer')).toContainText('50 used on this bill');

    // The Customers screen says what happened, and that she has a code (never what it is).
    await page.goto('/app/customers');
    await expect(page.getByTestId('points-Ada Obi')).toHaveText('90');                   // 100 - 100 + 140 - 50
    await page.getByTestId('customer-open-Ada Obi').click();
    await expect(page.getByTestId('view-history')).toContainText('Spent on a bill');
    await expect(page.getByTestId('view-history')).toContainText('Earned');
    await expect(page.getByTestId('view-history')).not.toContainText('4826');
    await page.keyboard.press('Escape');

    // The report: what is owed, then who took points and how it was allowed.
    await page.goto('/app/pos/reports/loyalty-points');
    await expect(page.getByTestId('report-title')).toHaveText('Loyalty Points Report');
    const table = page.getByTestId('report-table');
    await expect(table).toContainText('Ada Obi');
    await expect(table).toContainText('Yes');                                            // she has a code of her own
    await expect(page.getByTestId('report-totals')).toContainText('All customers');
    await page.getByTestId('filter-view').selectOption('cashier');
    await page.getByTestId('filter-apply').click();
    await expect(page.getByTestId('report-table')).toContainText('Points payments');
    await expect(page.getByTestId('report-totals')).toContainText('Everyone');

  });
});

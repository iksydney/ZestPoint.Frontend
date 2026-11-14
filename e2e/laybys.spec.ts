import { expect, test } from '@playwright/test';
import { PASSWORD, registerViaUi } from './helpers';

/**
 * Layby: a bill with a customer on it becomes a layby at the till; payments are taken on the Laybys screen; cancelling needs a
 * supervisor's or administrator's typed authorisation and gives back what was paid less the company's fee.
 */
test.describe('Laybys', () => {
  test('a bill is put on layby, a deposit is taken, and it is cancelled with authorisation less the fee', async ({ page }) => {
    const who = await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);

    // The company keeps 10% of what was paid when a layby is cancelled; the deposit and the days stay as they come (20%, 90 days).
    await page.goto('/app/settings/operations');
    await expect(page.getByTestId('layby-deposit')).toHaveValue('20');
    await expect(page.getByTestId('layby-days')).toHaveValue('90');
    await page.getByTestId('layby-fee').fill('10');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');

    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Sofa');
    await page.getByTestId('item-price').fill('10000');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Sofa')).toBeVisible();

    // At the till: a bill needs a customer before the Layby button appears.
    await page.goto('/app/pos');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Sofa for Ada');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Sofa').click();
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('bill-layby-btn')).toHaveCount(0);
    await page.getByTestId('bill-customer-btn').click();
    await page.getByTestId('cust-new-name').fill('Ada Obi');
    await page.getByTestId('cust-new-phone').fill('08035550101');
    await page.getByTestId('cust-add').click();
    await expect(page.getByTestId('bill-customer')).toContainText('Ada Obi');
    await page.getByTestId('bill-layby-btn').click();
    await expect(page.getByTestId('bill-layby')).toContainText('Layby #1');
    await expect(page.getByTestId('bill-layby')).toContainText('First payment at least');
    await expect(page.getByTestId('bill-layby')).toContainText('2,000.00');
    // Its items are fixed from now on.
    await page.getByTestId('product-Sofa').click();
    await expect(page.getByTestId('layby-error')).toContainText('items are fixed');

    // The Laybys screen: the deposit is offered as the first payment.
    await page.goto('/app/pos/laybys');
    const row = page.getByTestId('lb-Ada Obi');
    await expect(row).toContainText('1 x Sofa');
    await expect(page.getByTestId('lb-balance-Ada Obi')).toContainText('10,000.00');
    await page.getByTestId('lb-pay-Ada Obi').click();
    await expect(page.getByTestId('lb-amount')).toHaveValue('2000');
    await page.getByTestId('lb-amount').fill('1000');
    await page.getByTestId('lb-pay-confirm').click();
    await expect(page.getByTestId('lb-pay-error')).toContainText('At least 2000.00');
    await page.getByTestId('lb-amount').fill('3000');
    await page.getByTestId('lb-pay-confirm').click();
    await expect(page.getByTestId('lb-notice')).toContainText('Payment taken');
    await expect(page.getByTestId('lb-paid-Ada Obi')).toContainText('3,000.00');
    await expect(page.getByTestId('lb-balance-Ada Obi')).toContainText('7,000.00');

    // The sofa is held: the stock card says so.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-edit-Sofa').click();
    await expect(page.getByTestId('fig-layby')).toHaveText('1');
    await page.getByTestId('sc-close').click();

    // Cancelling: the screen says what is kept and what goes back, and a wrong password is refused.
    await page.goto('/app/pos/laybys');
    await page.getByTestId('lb-cancel-Ada Obi').click();
    await expect(page.getByTestId('lb-refund')).toContainText('2,700.00');             // 3,000 less 10%
    await page.getByTestId('lb-reason').fill('Changed her mind');
    await expect(page.getByTestId('lb-cancel-confirm')).toBeDisabled();                  // nobody has authorised it yet
    await page.getByTestId('auth-mode-password').click();
    await page.getByTestId('auth-email').fill(who.email);
    await page.getByTestId('auth-password').fill('not-the-password');
    await page.getByTestId('lb-cancel-confirm').click();
    await expect(page.getByTestId('lb-cancel-error')).toBeVisible();
    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('lb-cancel-confirm').click();
    await expect(page.getByTestId('lb-notice')).toContainText('Give Ada Obi back 2700');
    await expect(page.getByTestId('lb-table')).toContainText('Nothing here.');
    await page.getByTestId('lb-status').selectOption('Cancelled');
    await expect(page.getByTestId('lb-Ada Obi')).toContainText('Changed her mind');

    // The report opens from the POS menu.
    await page.goto('/app/pos/reports/laybys');
    await expect(page.getByRole('heading', { name: 'Layby Report' })).toBeVisible();

    // Phone width: the table scrolls inside its card and the page does not scroll sideways.
    await page.goto('/app/pos/laybys');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Laybys' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

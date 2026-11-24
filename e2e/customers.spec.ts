import { Page, expect, test } from '@playwright/test';
import { registerViaUi, openPos } from './helpers';

/**
 * Customers, loyalty points and sales back orders: a customer is added at the till by name and phone, earns each item's points when
 * the bill is paid, and can be kept waiting for an item that is then put on a bill for them.
 */

async function ownerInApp(page: Page) {
  await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

test.describe('Customers', () => {
  test('a customer is added at the till, earns points when the bill is paid, and a back order goes on a bill for them', async ({ page }) => {
    await ownerInApp(page);

    // An item that is worth 10 loyalty points.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Kettle');
    await page.getByTestId('item-price').fill('9000');
    await page.getByTestId('item-points').fill('10');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Kettle')).toBeVisible();

    // At the till: nobody with that phone yet, so the customer is added on the spot and put on the bill.
    await openPos(page);
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Walk in');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Kettle').click();
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId('bill-customer-btn').click();
    await page.getByTestId('cust-search').fill('0803');
    await expect(page.getByTestId('cust-none')).toBeVisible();
    await page.getByTestId('cust-new-name').fill('Ada Obi');
    await page.getByTestId('cust-new-phone').fill('0803 555 0101');
    await page.getByTestId('cust-add').click();
    await expect(page.getByTestId('bill-customer')).toContainText('Ada Obi');
    await expect(page.getByTestId('bill-customer')).toContainText('10 more when paid');

    // Paid in cash: the points are hers.
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-tendered').fill('9000');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    await expect(page.getByTestId('bill-customer')).toContainText('10 from this bill');

    // A second bill finds her by phone.
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Again');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Kettle').click();
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId('bill-customer-btn').click();
    await page.getByTestId('cust-search').fill('5550101');
    await page.getByTestId('cust-pick-Ada Obi').click();
    await expect(page.getByTestId('bill-customer')).toContainText('10 points');

    // The Customers screen: her points, one customer per phone, and details a manager can add.
    await page.goto('/app/customers');
    await expect(page.getByTestId('points-Ada Obi')).toHaveText('10');
    await page.getByTestId('customer-new').click();
    await page.getByTestId('customer-name').fill('Someone Else');
    await page.getByTestId('customer-phone').fill('08035550101');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('error-phone')).toContainText('already exists');
    await page.getByTestId('customer-phone').fill('07010000002');
    await page.getByTestId('customer-email').fill('else@example.com');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-count')).toHaveText('2 customers');
    await page.getByTestId('customer-open-Ada Obi').click();
    await expect(page.getByTestId('view-points')).toHaveText('10');
    await expect(page.getByTestId('view-history')).toContainText('Earned');
    await page.keyboard.press('Escape');

    // A back order: she wants two more kettles; none are in stock, and it is put on a bill for her anyway when asked.
    await page.goto('/app/pos/back-orders');
    await page.getByTestId('bo-new').click();
    await page.getByTestId('bo-customer-search').fill('Ada');
    await page.getByTestId('bo-customer-Ada Obi').click();
    await page.getByTestId('bo-item-search').fill('Kett');
    await page.getByTestId('bo-item-Kettle').click();
    await page.getByTestId('bo-qty').fill('2');
    await page.getByTestId('bo-note').fill('Blue if possible');
    await page.getByTestId('bo-save').click();
    const row = page.getByTestId('bo-Ada Obi-Kettle');
    await expect(row).toContainText('Waiting for stock');
    await expect(row).toContainText('Blue if possible');

    await page.goto('/app/inventory/items');
    await page.getByTestId('item-edit-Kettle').click();
    await expect(page.getByTestId('fig-back-orders')).toHaveText('2');
    await page.getByTestId('sc-close').click();

    await page.goto('/app/pos/back-orders');
    await page.getByTestId('bo-fulfil-Ada Obi').click();
    await expect(page.getByTestId('bo-done')).toContainText('for Ada Obi');
    await expect(page.getByTestId('bo-table')).toContainText('Nothing here.');
    await page.getByTestId('bo-status').selectOption('Supplied');
    await expect(page.getByTestId('bo-Ada Obi-Kettle')).toContainText('On bill #');

    // Phone width: the customers table scrolls inside its card and the page does not scroll sideways.
    await page.goto('/app/customers');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('customer-Ada Obi')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

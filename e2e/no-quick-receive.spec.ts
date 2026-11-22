import { Page, expect, test } from '@playwright/test';
import { choose, registerViaUi } from './helpers';

/**
 * Goods are received only through purchasing (owner's decision, 2026-11-22, to stop fraud): the quick "Receive goods" button is gone from the Stock Overview and the older Purchasing tab of
 * the Inventory page no longer receives an order itself, it opens the order at Goods Receiving, where it is checked in. (The server refuses the old quick route for everyone; that is
 * proved by the backend tests.)
 */

async function ownerInApp(page: Page): Promise<void> {
  await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

test.describe('Goods are received only through purchasing', () => {
  test('the Stock Overview has no Receive goods button and says where goods come in; an approved order on the Purchasing tab opens at Goods Receiving', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Cola');
    await page.getByTestId('item-price').fill('100');
    await page.getByTestId('item-cost').fill('10');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Cola')).toBeVisible();

    // The Stock Overview: the other buttons are there, the quick receive is not, and the screen says where goods come in.
    await page.goto('/app/inventory');
    await expect(page.getByTestId('new-item')).toBeVisible();
    await expect(page.getByTestId('receive-goods')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Receive goods' })).toHaveCount(0);
    await expect(page.getByTestId('stock-receive-hint')).toContainText('Purchasing');
    await expect(page.getByTestId('stock-receive-hint')).toContainText('Goods Receiving');

    // The older Purchasing tab: an order is made, submitted and approved there, and then it is received at Goods Receiving, not by a button that books it at once.
    await page.getByTestId('tab-purchasing').click();
    await page.getByTestId('new-supplier').click();
    await page.getByTestId('supplier-name').fill('Fresh Foods');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByRole('cell', { name: 'Fresh Foods' })).toBeVisible();
    await page.getByTestId('new-po').click();
    await choose(page, 'po-supplier', 'Fresh Foods');
    await choose(page, 'po-item-0', 'Cola');
    await page.getByTestId('po-qty-0').fill('5');
    await page.getByLabel('Unit cost').fill('10');
    await page.getByTestId('po-save').click();
    await page.locator('[data-testid^="submit-po-"]').first().click();
    await page.locator('[data-testid^="approve-po-"]').first().click();

    const receive = page.locator('[data-testid^="receive-po-"]').first();
    await expect(receive).toHaveText('Receive at Goods Receiving');
    await expect(receive).toHaveAttribute('href', /\/app\/purchasing\/orders\/[0-9a-f-]+\/receive$/);
    await receive.click();
    await expect(page).toHaveURL(/\/app\/purchasing\/orders\/[0-9a-f-]+\/receive$/);
    await expect(page.getByTestId('rcv-all')).toBeVisible();

    // Nothing has been booked by looking at it: Cola still has no stock.
    await page.goto('/app/inventory');
    await expect(page.getByTestId('item-Cola').getByTestId('on-hand')).toContainText('0');
  });
});

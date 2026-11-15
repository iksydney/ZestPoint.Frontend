import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * Owner's decisions of 2026-11-15: a company names its preparation stations; each stock group goes to one and an item can name its own;
 * Send makes a ticket per station. The bar holds payment; a kitchen does not.
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function newItem(page: Page, name: string, price: string, group?: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  if (group) await page.getByTestId('item-group').selectOption({ label: group });
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

test.describe('Preparation stations', () => {
  test('stations are set up, groups and items go to them, Send makes a ticket per station and only the bar holds payment', async ({ page }) => {
    test.slow();
    await ownerInApp(page);

    // The owner said yes to the bar man method: a Bar already exists. Stations are behind Admin > Set-up.
    await page.locator('[data-nav="setup.admin"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="pos.stations"]').click();
    const bar = page.getByTestId('station-row-Bar');
    await expect(bar).toContainText('Default');
    await expect(bar).toContainText('Until ready');
    await expect(bar).toContainText('When ready');

    // A kitchen: holds nothing, takes stock when the bill is sent. The same name is refused in other letters.
    await page.getByTestId('station-new').click();
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-name-error')).toContainText('name');
    await page.getByTestId('station-name').fill('Kitchen');
    await page.getByTestId('station-save').click();
    const kitchen = page.getByTestId('station-row-Kitchen');
    await expect(kitchen).toContainText('When sent');
    await page.getByTestId('station-new').click();
    await page.getByTestId('station-name').fill('kitchen');
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-name-error')).toContainText('Already used');
    await page.getByTestId('station-form').getByRole('button', { name: 'Cancel' }).click();

    // A group goes to the kitchen; an item in it is prepared there; an item in no group goes to the default (the bar).
    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Food');
    await expect(page.getByTestId('group-station').locator('option:checked')).toContainText('The default station (Bar)');
    await page.getByTestId('group-station').selectOption({ label: 'Kitchen' });
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Food')).toBeVisible();
    await newItem(page, 'Burger', '3000', 'Food');
    await newItem(page, 'Cola', '500');
    await page.getByTestId('item-edit-Cola').click();
    await expect(page.getByTestId('item-station').locator('option:checked')).toHaveText('As the stock group says');
    await page.getByTestId('sc-close').click();

    // Both on one bill: each goes to its station, and the bar's drink holds payment.
    await page.goto('/app/pos');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Both');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Burger').click();
    await page.getByTestId('product-Cola').click();
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('bar-state-Burger')).toHaveText('waiting at the kitchen');
    await expect(page.getByTestId('bar-state-Cola')).toHaveText('waiting at the bar');
    await expect(page.getByTestId('pay')).toBeDisabled();
    await expect(page.getByTestId('pay-lock')).toContainText('Waiting for the bar');

    // A bill of kitchen food alone can be paid while the food is still waiting: the kitchen does not hold payment.
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Food only');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Burger').click();
    // The owner is a bar man too here, so the new-ticket prompt of the first bill floats over the Send button: press it directly.
    await page.getByTestId('send-order').dispatchEvent('click');
    await expect(page.getByTestId('bar-state-Burger')).toHaveText('waiting at the kitchen');
    await expect(page.getByTestId('pay')).toBeEnabled();
    await expect(page.getByTestId('pay-lock')).toHaveCount(0);
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });

    // The bar's screen has a filter for the stations; each ticket says which station it is for.
    await page.goto('/app/pos/bar-orders');
    await expect(page.getByTestId('bar-stations')).toBeVisible();
    await page.getByTestId('bar-station-Kitchen').click();
    const queue = page.getByTestId('bar-queue');
    await expect(queue).toContainText('Burger');
    await expect(queue).not.toContainText('Cola');
    await expect(queue.getByTestId('bar-station')).toHaveText(['Kitchen', 'Kitchen']);
    for (let i = 0; i < 2; i++) {
      await queue.getByTestId('bar-take').first().click();
      await queue.getByTestId('bar-ready').first().click();
    }
    await expect(queue).not.toContainText('Burger');
    await page.getByTestId('bar-station-all').click();
    await expect(queue).toContainText('Cola');
    await queue.getByTestId('bar-take').click();
    await queue.getByTestId('bar-ready').click();
    await expect(page.getByTestId('bar-queue-empty')).toBeVisible();

    // The drink is made: payment on the bill that held it is open.
    await page.goto('/app/pos');
    await page.getByTestId('bill-Both').click();
    await expect(page.getByTestId('pay')).toBeEnabled();
    await expect(page.getByTestId('pay-lock')).toHaveCount(0);
  });
});

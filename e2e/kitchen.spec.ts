import { Page, expect, test } from '@playwright/test';
import { choose, registerViaUi } from './helpers';

/**
 * The kitchen display (design of 2026-11-15): a station's tickets on a wall screen, with a clock that turns them amber then red, items
 * ticked off, an all-day count, Bump and Recall, and a "can't make" that tells the waiter why.
 */

async function ownerInApp(page: Page) {
  await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

async function newItem(page: Page, name: string, price: string, group?: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  if (group) await choose(page, 'item-group', group);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

async function sendBill(page: Page, label: string, burgers: number) {
  await page.goto('/app/pos');
  await expect(page.getByTestId('product-grid')).toContainText('Burger');
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  for (let i = 0; i < burgers; i++) await page.getByTestId('product-Burger').click();
  // The owner is a bar man too, so a new-ticket prompt can float over Send: press it directly.
  await page.getByTestId('send-order').dispatchEvent('click');
  await expect(page.getByTestId('bar-state-Burger')).toHaveText(/waiting at the kitchen|being prepared/);
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Kitchen display', () => {
  test('a cook starts, ticks, bumps and recalls tickets, the clock turns them amber then red, and cannot-make tells the waiter', async ({ page }) => {
    test.slow();
    await ownerInApp(page);

    // A kitchen station whose tickets turn amber after 1 minute and red after 2. Red must come after amber.
    await page.goto('/app/settings/stations');
    await page.getByTestId('station-new').click();
    await page.getByTestId('station-name').fill('Kitchen');
    await page.getByTestId('station-amber').fill('1');
    await page.getByTestId('station-red').fill('1');
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-red-error')).toContainText('more minutes than amber');
    await page.getByTestId('station-red').fill('2');
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-row-Kitchen')).toContainText('1 / 2 min');

    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Food');
    await choose(page, 'group-station', 'Kitchen');
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Food')).toBeVisible();
    await newItem(page, 'Burger', '3000', 'Food');

    await sendBill(page, 'Order 1', 2);
    await sendBill(page, 'Order 2', 1);

    // The device thinks it is a minute and a half later than the tickets were sent (the server's times are not touched).
    await page.clock.install({ time: new Date(Date.now() + 90_000) });
    await page.goto('/app/pos/kitchen');
    await expect(page.getByTestId('main-nav').locator('[data-nav="pos.kitchen"]')).toBeVisible();
    await choose(page, 'kds-station', 'Kitchen');
    await expect(page.getByTestId('kds-station')).toHaveValue('Kitchen');
    const one = page.getByTestId('kitchen-ticket-Order 1');
    await expect(one).toBeVisible();
    await expect(page.getByTestId('allday-Burger')).toHaveText('3 x Burger');                  // 2 + 1 still to make
    await expect(one).toHaveAttribute('data-age', 'amber');

    // Start it, tick the item off and on again, and let a minute pass: it turns red.
    await one.getByTestId('kitchen-take').click();
    await expect(one.getByTestId('kitchen-bump')).toBeVisible();
    await one.getByTestId('kitchen-item-Burger').click();
    await expect(one.getByTestId('kitchen-item-Burger')).toHaveAttribute('data-prepared', 'true');
    await one.getByTestId('kitchen-item-Burger').click();
    await expect(one.getByTestId('kitchen-item-Burger')).toHaveAttribute('data-prepared', 'false');
    await one.getByTestId('kitchen-item-Burger').click();
    await expect(one.getByTestId('kitchen-item-Burger')).toHaveAttribute('data-prepared', 'true');
    await page.clock.fastForward('01:00');
    await expect(one).toHaveAttribute('data-age', 'red');

    // Bump: the ticket goes, the all-day count drops and it is in "just made".
    await one.getByTestId('kitchen-bump').click();
    await expect(page.getByTestId('kitchen-ticket-Order 1')).toHaveCount(0);
    await expect(page.getByTestId('allday-Burger')).toHaveText('1 x Burger');
    const recent = page.getByTestId('kitchen-recent-Order 1');
    await expect(recent).toContainText('2 x Burger');

    // Recall it: it is being made again, and the tick is cleared.
    await recent.getByTestId('kitchen-recall').click();
    await expect(page.getByTestId('kitchen-ticket-Order 1').getByTestId('kitchen-bump')).toBeVisible();
    await expect(page.getByTestId('kitchen-ticket-Order 1').getByTestId('kitchen-item-Burger')).toHaveAttribute('data-prepared', 'false');
    await expect(page.getByTestId('kitchen-recent')).toHaveCount(0);
    await page.getByTestId('kitchen-ticket-Order 1').getByTestId('kitchen-bump').click();
    await expect(page.getByTestId('kitchen-recent-Order 1')).toBeVisible();

    // The kitchen cannot make the second one: it says why, and the ticket leaves the board.
    const two = page.getByTestId('kitchen-ticket-Order 2');
    await two.getByTestId('kitchen-take').click();
    await two.getByTestId('kitchen-cant').click();
    await expect(page.getByTestId('kitchen-cant-qty-Burger')).toHaveValue('1');
    await page.getByTestId('kitchen-cant-reason-input').fill('Out of buns');
    await page.getByTestId('kitchen-cant-confirm').click();
    await expect(page.getByTestId('kitchen-ticket-Order 2')).toHaveCount(0);
    await expect(page.getByTestId('kitchen-empty')).toBeVisible();
    await expect(page.getByTestId('allday-empty')).toBeVisible();

    // The times of the ticket that was made are in the report.
    await page.goto('/app/pos/reports/preparation-times');
    await expect(page.getByTestId('report-title')).toHaveText('Preparation Times Report');
    await expect(page.getByTestId('report-table')).toContainText('Kitchen');
  });
});

import { Page, expect, test } from '@playwright/test';
import { choose, registerViaUi, openPos } from './helpers';

/**
 * Owner's report of 2026-11-24: items "for the kitchen" showed "waiting at the bar" on the bill. Each way a person says "this is made in the kitchen" is walked here through the real
 * screens, from setting the station to the mark on the sent bill: on the item's own stock card, on a group made in the window over the item form, and on a group made under a
 * parent group that goes to the kitchen.
 */

async function ownerWithKitchen(page: Page): Promise<void> {
  // A company with the bar man method on: it starts with a Bar only, so a Kitchen is added (Admin, Set-up, Stations) the way an owner does.
  await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await page.locator('[data-nav="setup.admin"]').click();
  await page.locator('[data-testid="hub-list"] [data-nav="pos.stations"]').click();
  await page.getByTestId('station-new').click();
  await page.getByTestId('station-name').fill('Kitchen');
  await page.getByTestId('station-save').click();
  await expect(page.getByTestId('station-row-Kitchen')).toBeVisible();
}

async function sendOne(page: Page, item: string): Promise<void> {
  await openPos(page);
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(`T-${item.length}`);
  await page.getByTestId('nb-create').click();
  await page.getByTestId(`product-${item}`).click();
  await page.getByTestId('send-order').click();
}

test.describe('Which station a sent item says it is waiting at', () => {
  test('an item that names the kitchen on its own stock card says the kitchen', async ({ page }) => {
    test.slow();
    await ownerWithKitchen(page);
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Kitchen Test');
    await page.getByTestId('item-price').fill('8000');
    await choose(page, 'item-station', 'Kitchen');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Kitchen Test')).toBeVisible();

    // What was saved: the card shows the kitchen again when it is opened.
    await page.getByTestId('item-edit-Kitchen Test').click();
    await expect(page.getByTestId('item-station')).toHaveValue('Kitchen');
    await page.getByTestId('sc-close').click();

    await sendOne(page, 'Kitchen Test');
    await expect(page.getByTestId('bar-state-Kitchen Test')).toHaveText('waiting at the kitchen');
  });

  test('an item in a group made in the window over the item form, with the kitchen chosen there, says the kitchen', async ({ page }) => {
    test.slow();
    await ownerWithKitchen(page);
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Kitchen Test 2');
    await page.getByTestId('item-price').fill('5000');
    await page.getByTestId('item-group-new').click();
    await page.getByTestId('ng-name').fill('Hot Food');
    await choose(page, 'ng-station', 'Kitchen');
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-form')).toHaveCount(0);
    await expect(page.getByTestId('item-group')).toHaveValue('Hot Food');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Kitchen Test 2')).toBeVisible();

    // The group kept the kitchen.
    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-edit-Hot Food').click();
    await expect(page.getByTestId('group-station')).toHaveValue('Kitchen');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await sendOne(page, 'Kitchen Test 2');
    await expect(page.getByTestId('bar-state-Kitchen Test 2')).toHaveText('waiting at the kitchen');
  });

  test('an item in a group made under a parent group that goes to the kitchen says the kitchen', async ({ page }) => {
    test.slow();
    await ownerWithKitchen(page);
    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-new').click();
    await page.getByTestId('group-name').fill('Food');
    await choose(page, 'group-station', 'Kitchen');
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Food')).toBeVisible();

    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Pasta');
    await page.getByTestId('item-price').fill('4000');
    await page.getByTestId('item-group-new').click();
    await page.getByTestId('ng-name').fill('Pasta dishes');
    await choose(page, 'ng-parent', 'Food');
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-form')).toHaveCount(0);
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Pasta')).toBeVisible();

    await sendOne(page, 'Pasta');
    await expect(page.getByTestId('bar-state-Pasta')).toHaveText('waiting at the kitchen');
  });
});

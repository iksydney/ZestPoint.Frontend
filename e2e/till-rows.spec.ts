import { Page, expect, test } from '@playwright/test';
import { choose, registerViaUi, openPos } from './helpers';

/**
 * Owner's decisions of 2026-11-14:
 *  - the bill shows one row per item with a box to type the quantity; what was sent stays sent;
 *  - an item carries its own Discount %, set on the stock card and taken off by the till by itself;
 *  - every "new item" button opens the full stock card, and recipes and options live on it (the Catalogue screen is gone).
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function newBill(page: Page, name: string) {
  await openPos(page);
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(name);
  await page.getByTestId('nb-create').click();
  await expect(page.getByTestId('current-bill')).toContainText(name);
}

test.describe('Till rows, item discount and the stock card', () => {
  test('the same item joins one row, the quantity is typed, the item discount comes off, and sent units cannot be typed away', async ({ page }) => {
    await ownerInApp(page);

    // The Stock Overview's own button opens the full stock card, not a cut-down form.
    await page.goto('/app/inventory');
    await page.getByTestId('new-item').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: new item');
    await page.getByTestId('item-name').fill('Soda');
    await page.getByTestId('item-price').fill('1000');
    await page.getByTestId('item-discount-percent').fill('10');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Soda')).toBeVisible();

    await newBill(page, 'Rows');
    await page.getByTestId('product-Soda').click();
    await page.getByTestId('product-Soda').click();
    const row = page.getByTestId('line-Soda');
    await expect(row).toHaveCount(1);                                                  // one row, not two
    const qty = row.getByTestId('line-qty');
    await expect(qty).toHaveValue('2');
    await expect(row.getByTestId('item-discount-Soda')).toHaveText('10% off');

    // Typing the quantity: 5 at 1,000 less 10% each.
    await qty.fill('5');
    await qty.press('Enter');
    await expect(row).toContainText('4,500.00');
    await expect(row.getByTestId('line-discount-Soda')).toContainText('500.00');
    await expect(page.getByTestId('bill-totals')).toContainText('Discounts');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(row).toContainText('4,500.00');                                       // the server agrees
    await expect(qty).toHaveValue('5');

    // Once sent, more can be added on the same row and only the extra waits to be sent.
    await page.getByTestId('send-order').click();
    await expect(row.getByTestId('sent-Soda')).toHaveText('sent');
    await row.getByRole('button', { name: 'More' }).click();
    await expect(qty).toHaveValue('6');
    await expect(page.getByTestId('line-Soda')).toHaveCount(1);
    await expect(row.getByTestId('sent-Soda')).toHaveText('5 sent');
    await expect(row.getByTestId('unsent-Soda')).toHaveText('1 not sent yet');

    // Below what was sent is refused: that is a void.
    await qty.fill('3');
    await qty.press('Enter');
    await expect(page.getByTestId('pos-error')).toContainText('already been sent');
    await expect(qty).toHaveValue('6');
    await expect(row.getByRole('button', { name: 'Fewer' })).toBeEnabled();

    // Taking the unsent one off leaves the sent five; minus then has nothing left to take.
    await row.getByTestId('remove-Soda').click();
    await expect(qty).toHaveValue('5');
    await expect(row.getByRole('button', { name: 'Fewer' })).toBeDisabled();
    await expect(row.getByTestId('void-Soda')).toBeVisible();
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(row).toContainText('4,500.00');
  });

  test('a recipe and options are set on the stock card, and Catalogue is gone from the menu', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/inventory/items');
    await expect(page.locator('[data-nav="catalog"]')).toHaveCount(0);

    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Rum');
    await page.getByTestId('item-kind').selectOption('Ingredient');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Rum')).toBeVisible();

    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Mojito');
    await page.getByTestId('item-price').fill('2000');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Mojito')).toBeVisible();

    await page.getByTestId('item-edit-Mojito').click();
    await page.getByTestId('sc-tab-recipe').click();
    const tab = page.getByTestId('recipe-tab');
    await expect(tab.getByTestId('options-editor')).toBeVisible();

    await tab.getByTestId('add-ingredient').click();
    await choose(tab, 'ing-item-0', 'Rum');
    await tab.getByTestId('ing-qty-0').fill('50');
    await tab.getByTestId('save-recipe').click();
    await expect(tab.getByTestId('recipe-msg')).toHaveText('Saved as version 1.');
    await expect(tab.getByTestId('recipe-current')).toContainText('version 1');

    await tab.getByTestId('add-modifier').click();
    await tab.getByTestId('mod-name-0').fill('Double');
    await tab.getByTestId('mod-price-0').fill('500');
    await tab.getByTestId('save-options').click();
    await expect(tab.getByTestId('options-msg')).toHaveText('Options saved.');

    // The till offers the option when the item is picked.
    await newBill(page, 'Cocktails');
    await page.getByTestId('product-Mojito').click();
    await page.getByTestId('mod-Double').check();
    await page.getByTestId('mod-add').click();
    await expect(page.getByTestId('line-Mojito')).toContainText('+ Double');
    await expect(page.getByTestId('line-Mojito')).toContainText('2,500.00');
  });
});

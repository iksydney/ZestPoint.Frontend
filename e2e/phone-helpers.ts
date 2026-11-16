import { Page, expect } from '@playwright/test';
import { pick, registerViaUi } from './helpers';

/** What the installable-app and phone specs share: a company to work in, items, stock, a stock take, and "nothing is wider than the screen". */

export async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

export async function addItem(page: Page, name: string, price: string, barcode?: string) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  if (barcode) await page.getByTestId('item-barcode').fill(barcode);
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

/** Puts stock on an item through an adjustment (the way opening stock is booked), so a stock take has something to count. */
export async function stockUp(page: Page, item: string, quantity: string) {
  await page.goto('/app/inventory/adjustments');
  await page.waitForLoadState('networkidle');
  await pick(page, 'adjust-item', item);
  await expect(page.getByTestId('adjust-expected')).toContainText('0');
  await page.getByTestId('adjust-qty').fill(quantity);
  await page.getByTestId('adjust-reason').selectOption({ label: 'Count correction' });
  await page.getByTestId('adjust-submit').click();
  await expect(page.getByTestId('adjust-message')).toContainText('Stock was updated');
}

/** A new stock take, started: the expected quantities are snapshotted and counting can begin. */
export async function startCount(page: Page) {
  await page.goto('/app/inventory/reports/stock-take');
  await page.getByTestId('take-new').click();
  await page.getByTestId('take-create').click();
  await page.getByTestId('take-start').click();
  await expect(page.getByTestId('take-status')).toHaveText('Counting');
}

/** A tab with a name on it, at the till. */
export async function newBill(page: Page, label: string) {
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
}

/** Nothing on the page is wider than the screen (no sideways scrolling of the page itself). */
export async function fits(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what} is wider than the screen by ${overflow}px`).toBeLessThanOrEqual(1);
}

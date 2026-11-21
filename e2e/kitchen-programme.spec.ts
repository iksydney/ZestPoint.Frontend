import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * The kitchen programme (owner's decisions, 2026-11-21): a cake made in batches from the stock card to the Production screen and the food cost, cash buying at a market with its
 * expenses and a manager's confirmation, and a station asking the store for stock (refused until the station has its own stock place).
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function newItem(page: Page, name: string, price: string, cost: string, extra: Record<string, string> = {}) {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('item-cost').fill(cost);
  for (const [testId, value] of Object.entries(extra)) await page.getByTestId(testId).fill(value);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

test.describe('The kitchen programme', () => {
  test('a cake made in batches: its recipe on the stock card, the batch recorded on Production, and what it costs on Food cost', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await newItem(page, 'Flour', '100', '1');
    await newItem(page, 'Chocolate cake', '500', '0', { 'item-portions': '8', 'item-shelf-life': '2', 'item-expiry-alert': '1' });

    // The cake's card keeps what was typed, and its Recipe tab says what a batch takes.
    await page.getByTestId('item-edit-Chocolate cake').click();
    await expect(page.getByTestId('item-portions')).toHaveValue('8');
    await expect(page.getByTestId('item-shelf-life')).toHaveValue('2');
    await expect(page.getByTestId('item-expiry-alert')).toHaveValue('1');
    await page.getByTestId('sc-tab-recipe').click();
    await expect(page.getByTestId('batch-editor')).toBeVisible();
    await page.getByTestId('batch-add').click();
    await page.getByTestId('batch-item-0').selectOption({ index: 1 });
    await page.getByTestId('batch-qty-0').fill('500');
    await page.getByTestId('batch-save').click();
    await expect(page.getByTestId('batch-msg')).toHaveText('Batch recipe saved.');
    await expect(page.getByTestId('batch-cost')).toContainText('One batch costs 500.00');
    await page.getByTestId('sc-close').click();

    // Production: one batch expected to give 8 slices gave 7; the difference is shown before and kept after.
    await page.goto('/app/inventory/production');
    await page.getByTestId('production-item').selectOption({ label: 'Chocolate cake' });
    await expect(page.getByTestId('production-summary')).toContainText('One batch gives 8 portions and takes 1 ingredient');
    await page.getByTestId('production-actual').fill('7');
    await expect(page.getByTestId('production-variance')).toContainText('1 fewer');
    await page.getByTestId('production-record').click();
    const row = page.getByTestId('run-row-1');
    await expect(row).toContainText('Chocolate cake');
    await expect(row).toContainText('-1');
    await expect(row).toContainText('71.43');                                          // 500 g of flour at 1 across 7 slices

    // Food cost: a slice costs 71.43 against a price of 500; the price that reaches 30% is lower, and one click sets it.
    await page.goto('/app/inventory/food-cost');
    await expect(page.getByTestId('dish-percent-Chocolate cake')).toContainText('14.3%');
    await expect(page.getByTestId('dish-suggested-Chocolate cake')).toContainText('238.10');
    await page.getByTestId('dish-apply-Chocolate cake').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('dish-percent-Chocolate cake')).toContainText('30%');
  });

  test('a market run: stock in at once, the cash reconciled with its expenses and reasons, then confirmed', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await newItem(page, 'Tomato', '100', '0');
    await page.goto('/app/purchasing/market-runs');
    await expect(page.getByTestId('runs-empty')).toBeVisible();
    await page.getByTestId('run-new').click();

    // Nothing is accepted without what was bought; an expense needs its reason; the sum on screen says what is not accounted for.
    await page.getByTestId('run-market').fill('Mile 12');
    await page.getByTestId('run-given').fill('20000');
    await page.getByTestId('run-change').fill('500');
    await page.getByTestId('run-item-0').selectOption({ index: 1 });
    await page.getByTestId('run-qty-0').fill('5000');
    await page.getByTestId('run-paid-0').fill('9000');
    await page.getByTestId('run-add-expense').click();
    await page.getByTestId('run-exp-cat-0').selectOption('LocalLeviesAndSecurity');
    await page.getByTestId('run-exp-amount-0').fill('2000');
    await expect(page.getByTestId('run-diff')).toHaveText('8,500.00');                 // 20,000 - 9,000 - 2,000 - 500
    await page.getByTestId('run-save').click();
    await expect(page.getByTestId('run-error')).toBeVisible();                           // the levy has no reason yet
    await page.getByTestId('run-exp-why-0').fill('Market union gate fee for loading');
    await page.getByTestId('run-save').click();

    const row = page.getByTestId('run-row-1');
    await expect(row).toContainText('Mile 12');
    await expect(page.getByTestId('run-status-1')).toHaveText('Waiting to be confirmed');
    await expect(page.getByTestId('run-difference-1')).toHaveText('8,500.00');
    await expect(row).toContainText('Levies');                                           // flagged for the manager

    // The manager (the owner may confirm their own run) queries it, needing words, then confirms it.
    await page.getByTestId('run-query-1').click();
    await expect(page.getByTestId('decide-send')).toBeDisabled();
    await page.getByTestId('decide-note').fill('Where is the receipt for the gate fee?');
    await page.getByTestId('decide-send').click();
    await expect(page.getByTestId('run-status-1')).toHaveText('Queried');
    await page.getByTestId('run-confirm-1').click();
    await page.getByTestId('decide-send').click();
    await expect(page.getByTestId('run-status-1')).toHaveText('Confirmed');
    await expect(page.getByTestId('run-confirm-1')).toHaveCount(0);
  });

  test('a station asks the store for stock: refused until it has its own stock place, then asked, and the hand-over says plainly when the store has none', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await newItem(page, 'Flour', '100', '1');
    await page.goto('/app/inventory/issues');
    await expect(page.getByTestId('issues-empty')).toBeVisible();

    const ask = async () => {
      await page.getByTestId('issue-new').click();
      await page.getByTestId('ask-item-0').selectOption({ index: 1 });
      await page.getByTestId('ask-qty-0').fill('1000');
      await page.getByTestId('ask-send').click();
    };

    // The Bar has no stock place of its own yet: the request is refused and points to where to set it up.
    await ask();
    await expect(page.getByTestId('ask-error')).toContainText('Bin Locations');
    await page.getByTestId('ask-form').getByRole('button', { name: 'Cancel' }).click();

    // A bin that belongs to the Bar, and the request is accepted.
    await page.goto('/app/inventory/bins');
    await page.getByTestId('bin-new').click();
    await page.getByTestId('bin-code').fill('BAR-1');
    await page.getByTestId('bin-name').fill('Bar shelf');
    await page.getByTestId('bin-station').selectOption({ label: 'Bar' });
    await page.getByTestId('bin-save').click();
    await expect(page.getByTestId('bin-row-BAR-1')).toBeVisible();
    await page.goto('/app/inventory/issues');
    await ask();
    await expect(page.getByTestId('issue-row-1')).toContainText('for the Bar');
    await expect(page.getByTestId('issue-status-1')).toHaveText('Waiting for the store');

    // Handing it over when the store holds none is refused in plain words, and the request stays open.
    await page.getByTestId('issue-open-1').click();
    await page.getByTestId('issue-send').click();
    await expect(page.getByTestId('issue-error')).toContainText('Flour');
    await page.getByTestId('issue-form').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('issue-status-1')).toHaveText('Waiting for the store');

    // It can be cancelled, with a reason.
    await page.getByTestId('issue-cancel-1').click();
    await page.getByTestId('cancel-reason').fill('Asked by mistake');
    await page.getByTestId('cancel-send').click();
    await expect(page.getByTestId('issues-empty')).toBeVisible();
    await page.getByTestId('issues-show-all').check();
    await expect(page.getByTestId('issue-status-1')).toHaveText('Cancelled');
  });
});

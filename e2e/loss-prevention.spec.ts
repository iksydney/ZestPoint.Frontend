import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi, startShiftWhenAsked } from './helpers';

/**
 * Loss prevention (design of 2026-11-15, "rank, alert and review"): a cashier closes a shift with the drawer badly out, the owner looks, finds the alert, reviews it
 * (a follow-up needs a note), and changes a rule.
 */

async function addPinStaff(page: Page, name: string, roleKey: string, pin: string): Promise<string> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  await page.getByTestId('create-staff').click();
  const code = (await page.getByTestId('staff-added-code').innerText()).trim();
  await page.getByTestId('staff-added-done').click();
  return code;
}

async function pinSignIn(page: Page, slug: string, code: string, pin: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(slug);
  await page.getByTestId('mode-pin').click();
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/app\/(dashboard|pos)/);
}

test.describe('Loss prevention', () => {
  test('a shift closed with the drawer badly out raises an alert that the owner reviews, and a rule can be changed', async ({ page, browser }) => {
    test.slow();
    const who = await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    const code = await addPinStaff(page, 'Tunde Till', 'cashier', '4826');

    // The cashier starts a shift (asked when the Point of Sale is opened) with a counted float of 500 and closes it with nothing in the drawer.
    const cashier = await newContext(browser);
    await pinSignIn(cashier.page, who.slug, code, '4826');
    await cashier.page.goto('/app/pos');
    await startShiftWhenAsked(cashier.page, '500');
    await cashier.page.goto('/app/pos/day-management');
    await cashier.page.getByTestId('close-count').fill('0');
    await cashier.page.getByTestId('close-confirm').check();
    await cashier.page.getByTestId('close-btn').click();
    await cashier.page.getByTestId('confirm-ok').click();
    await expect(cashier.page.getByTestId('day-pending')).toBeVisible();
    await cashier.context.close();

    // The owner finds Loss Prevention behind the Head Office reports.
    await page.goto('/app/dashboard');
    const group = page.getByTestId('nav-group-head');
    if ((await group.getAttribute('aria-expanded')) === 'false') await group.click();
    await page.locator('[data-nav="reports.head"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="head.report.loss"]').click();
    await expect(page.getByTestId('lp-title')).toHaveText('Loss Prevention');
    await expect(page.getByTestId('lp-notes')).toContainText('never proof');

    // Nothing is found until the rules are run (each hour by the worker, or now by the person who may change them).
    await page.getByTestId('lp-tab-rules').click();
    await expect(page.getByTestId('lp-rule-cash_difference')).toContainText('Cash difference at shift close');
    await page.getByTestId('lp-check-now').click();
    await expect(page.getByTestId('lp-rules-note')).toContainText('new alert');

    // The alert says what was found; the overview ranks the person and says why.
    await page.getByTestId('lp-tab-overview').click();
    await expect(page.getByTestId('lp-person-Tunde Till')).toContainText('cash difference at shift close');
    await page.getByTestId('lp-tab-alerts').click();
    const row = page.getByTestId('lp-alert-cash_difference');
    await expect(row).toContainText('Tunde Till');
    await expect(row).toContainText('short by 500.00');
    await expect(row).toHaveAttribute('data-state', 'Open');

    // A follow-up must say what was done; then it is reviewed and leaves the waiting list.
    await page.getByTestId('lp-review-cash_difference').click();
    await page.getByTestId('lp-outcome-FollowedUp').check();
    await page.getByTestId('lp-review-save').click();
    await expect(page.getByTestId('lp-review-error')).toContainText('Say what was done');
    await page.getByTestId('lp-note').fill('Counted again with her: the float was banked.');
    await page.getByTestId('lp-review-save').click();
    await expect(page.getByTestId('lp-no-alerts')).toBeVisible();
    await page.getByTestId('lp-state').selectOption('Reviewed');
    await page.getByTestId('lp-alerts-apply').click();
    await expect(page.getByTestId('lp-alert-cash_difference')).toContainText('Followed up');
    await expect(page.getByTestId('lp-alert-cash_difference')).toContainText('the float was banked');

    // A rule can be changed, and the change is kept.
    await page.getByTestId('lp-tab-rules').click();
    await expect(page.getByTestId('lp-rule-number-cash_difference')).toHaveValue('100');                      // the rules have arrived
    await page.getByTestId('lp-rule-number-cash_difference').fill('1000');
    await page.getByTestId('lp-rule-save-cash_difference').click();
    await expect(page.getByTestId('lp-rules-note')).toContainText('Saved: Cash difference at shift close');
    await page.reload();
    await page.getByTestId('lp-tab-rules').click();
    await expect(page.getByTestId('lp-rule-number-cash_difference')).toHaveValue('1000');
    await expect(page.getByTestId('lp-rule-cash_difference')).toContainText('changed');
  });
});

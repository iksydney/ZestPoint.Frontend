import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi } from './helpers';

/**
 * A company whose plan does not include the Kitchen Display module keeps EVERY station on Bar Orders, whatever the stored choice says (owner's decision of
 * 2026-11-24, backend section 63 and its follow-up). The server says so with two fields on each station: `screenInEffect` (where its tickets really show) and
 * `screenHeldByPlan` (the stored choice is Kitchen Display but the plan lacks the module). The Stations screen shows the screen in effect, says in plain words
 * why, and keeps the stored choice for the day the plan has the module. Nothing is stubbed: the plan is made and assigned by an operator, as in subscription.spec.ts.
 */

const OPERATOR_EMAIL = 'operator@zestpoint.e2e';
const OPERATOR_PASSWORD = 'Operat0r-E2E-Passw0rd!';
const HELD = 'Your plan does not include the Kitchen display, so this station\'s tickets show on Bar Orders. The choice is kept for when it does.';

async function ownerWithKitchen(page: Page) {
  const who = await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await page.locator('[data-nav="setup.admin"]').click();
  await page.locator('[data-testid="hub-list"] [data-nav="pos.stations"]').click();
  await page.getByTestId('station-new').click();
  await page.getByTestId('station-name').fill('Kitchen');
  await page.getByTestId('station-save').click();
  await expect(page.getByTestId('station-row-Kitchen')).toBeVisible();
  return who;
}

test.describe('A plan without the Kitchen display', () => {
  test('keeps every station on Bar Orders, says so in plain words on the Stations screen, and keeps the choice', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const who = await ownerWithKitchen(page);

    // With the module, the Kitchen is on the Kitchen Display and nothing says otherwise (the old guess-based warning is gone).
    await expect(page.getByTestId('station-screen-Kitchen')).toHaveText('Kitchen Display');
    await expect(page.getByTestId('station-screen-held-Kitchen')).toHaveCount(0);
    await page.getByTestId('station-edit-Kitchen').click();
    await expect(page.getByTestId('station-screen')).toHaveValue('KitchenDisplay');
    await expect(page.getByTestId('station-screen-plan')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).first().click();

    // An operator assigns a plan with Core POS only (no Kitchen display).
    const operator = await newContext(browser);
    const op = operator.page;
    await op.goto('/platform/login');
    await op.getByTestId('platform-email').fill(OPERATOR_EMAIL);
    await op.getByTestId('platform-password').fill(OPERATOR_PASSWORD);
    await op.getByTestId('platform-submit').click();
    await expect(op).toHaveURL(/\/platform\/overview$/);
    await op.getByTestId('nav-plans').click();
    await op.getByTestId('new-plan').click();
    const code = `express-${who.slug.slice(-6)}`;
    const planName = `Express ${who.slug.slice(-6)}`;
    await op.getByTestId('plan-code').fill(code);
    await op.getByTestId('plan-name').fill(planName);
    await op.getByTestId('plan-price').fill('1900');
    await op.getByTestId('plan-module-core_pos').check();
    await op.getByTestId('plan-save').click();
    await expect(op.getByTestId(`plan-row-${code}`)).toContainText(planName);
    await op.getByTestId('nav-tenants').click();
    await op.getByTestId('tenant-search').fill(who.slug);
    await op.getByTestId('tenant-find').click();
    await op.getByTestId(`tenant-${who.slug}`).getByRole('link').first().click();
    await expect(op.getByTestId('detail-subscription')).toBeVisible();
    await op.getByTestId('act-plan').click();
    await op.getByTestId('action-plan').selectOption({ label: planName });
    await op.getByTestId('action-reason').fill('A company on the express plan');
    await op.getByTestId('action-confirm').click();
    await expect(op.getByTestId('detail-plan')).toHaveText(planName);
    await expect(op.getByTestId('mod-kds_integration')).toContainText('None');
    await operator.context.close();

    // The company's next load: the Kitchen's badge says where its tickets really show, with the reason beside it; the Bar is untouched.
    await page.goto('/app/settings/stations');
    const badge = page.getByTestId('station-screen-Kitchen');
    await expect(badge).toHaveText('Bar Orders');
    await expect(badge).toHaveAttribute('data-screen', 'BarOrders');
    await expect(page.getByTestId('station-screen-held-Kitchen')).toHaveText(HELD);
    await expect(page.getByTestId('station-screen-held-Bar')).toHaveCount(0);

    // The form still lets the person choose Kitchen Display, shows the stored choice and the same words, and saving it is allowed.
    await page.getByTestId('station-edit-Kitchen').click();
    await expect(page.getByTestId('station-screen')).toHaveValue('KitchenDisplay');
    await expect(page.getByTestId('station-screen-plan')).toHaveText(HELD);
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-form')).toHaveCount(0);
    await expect(page.getByTestId('station-screen-Kitchen')).toHaveText('Bar Orders');
    await expect(page.getByTestId('station-screen-held-Kitchen')).toHaveText(HELD);
    await page.reload();
    await page.getByTestId('station-edit-Kitchen').click();
    await expect(page.getByTestId('station-screen')).toHaveValue('KitchenDisplay');         // the choice was kept
    await page.getByRole('button', { name: 'Cancel' }).first().click();

    // Bar Orders is where its tickets show, so it does not say that no station is shown there.
    await page.goto('/app/pos/bar-orders');
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.getByTestId('bar-no-station')).toHaveCount(0);
  });
});

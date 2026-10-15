import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi } from './helpers';

const OPERATOR_EMAIL = 'operator@zestpoint.e2e';
const OPERATOR_PASSWORD = 'Operat0r-E2E-Passw0rd!';

/** Registers a company, publishes the starter brand and lands in the app (the company starts a free trial of the top plan). */
async function newCompany(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function operatorSignIn(page: Page) {
  await page.goto('/platform/login');
  await page.getByTestId('platform-email').fill(OPERATOR_EMAIL);
  await page.getByTestId('platform-password').fill(OPERATOR_PASSWORD);
  await page.getByTestId('platform-submit').click();
  await expect(page).toHaveURL(/\/platform\/overview$/);
}

async function openCompany(page: Page, slug: string) {
  await page.getByTestId('nav-tenants').click();
  await page.getByTestId('tenant-search').fill(slug);
  await page.getByTestId('tenant-find').click();
  await page.getByTestId(`tenant-${slug}`).getByRole('link').first().click();
  await expect(page.getByTestId('detail-subscription')).toBeVisible();
}

test.describe('Subscriptions, entitlements and the platform interface (criteria 25-30)', () => {
  test('a new company starts a free trial of the top plan, sees what it includes and can switch plans', async ({ page }) => {
    await newCompany(page);
    await page.goto('/app/subscription');

    await expect(page.getByTestId('plan-name')).toHaveText('Enterprise Lounge');
    await expect(page.getByTestId('sub-status')).toHaveText('Free trial');
    await expect(page.getByTestId('period-line')).toContainText('Free trial until');
    await expect(page.getByTestId('billing-demo-note')).toContainText('no real money');
    await expect(page.getByTestId('module-core_pos')).toContainText('Available');
    await expect(page.getByTestId('module-hotel_pms_room_charging')).toContainText('Available');
    await expect(page.getByTestId('usage')).toContainText('Active branches');

    // Try a smaller plan during the trial: free, immediate, and the module list follows.
    await page.getByTestId('choose-cocktail-pro').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByTestId('plan-name')).toHaveText('Cocktail Pro');
    await expect(page.getByTestId('module-hotel_pms_room_charging')).toContainText('Locked');
    await expect(page.getByTestId('module-hotel_pms_room_charging').getByTestId('module-upgrade')).toContainText('Enterprise Lounge');
    await expect(page.getByTestId('module-core_pos')).toContainText('Available');

    // The ledger records what happened, in order.
    await expect(page.getByTestId('ledger-table')).toContainText('Plan downgraded');
    await expect(page.getByTestId('ledger-table')).toContainText('Trial started');
  });

  test('a payment method can be added and a development decline is explained, not hidden', async ({ page }) => {
    await newCompany(page);
    await page.goto('/app/subscription');

    await page.getByTestId('pm-token').fill('not-a-token');
    await page.getByTestId('pm-save').click();
    await expect(page.getByTestId('sub-error')).toContainText(/token|accepted/i);

    await page.getByTestId('pm-token').fill('tok_ok');
    await page.getByTestId('pm-save').click();
    await expect(page.getByTestId('payment-method')).toContainText('Development test card');
    // Starting the paid plan now takes the payment through the (development) billing adapter and records it.
    await page.getByTestId('pay-now').click();
    await expect(page.getByTestId('sub-status')).toHaveText('Active');
    await expect(page.getByTestId('billing-table')).toContainText('Demo');
    await expect(page.getByTestId('billing-table')).toContainText('Paid');
  });

  test('the platform operator restricts a company; its people see the banner and only the billing screens; payment restores access', async ({ page, browser }) => {
    const who = await newCompany(page);

    const operator = await newContext(browser);
    await operatorSignIn(operator.page);
    await openCompany(operator.page, who.slug);
    await expect(operator.page.getByTestId('detail-status')).toHaveText('Trialing');

    await operator.page.getByTestId('act-restrict').click();
    await expect(operator.page.getByTestId('action-confirm')).toBeDisabled(); // a reason is mandatory
    await operator.page.getByTestId('action-reason').fill('Chargeback dispute under review');
    await operator.page.getByTestId('action-confirm').click();
    await expect(operator.page.getByTestId('detail-status')).toHaveText('Restricted');
    await expect(operator.page.getByTestId('detail-ledger')).toContainText('Restricted by the platform');
    await expect(operator.page.getByTestId('detail-ledger')).toContainText('Platform:');

    // The company's own session picks the state up on its next load.
    await page.goto('/app/pos');
    await expect(page).toHaveURL(/\/app\/subscription$/);
    await expect(page.getByTestId('account-banner')).toHaveAttribute('data-code', 'restricted');
    await expect(page.getByTestId('banner-message')).toContainText('nothing has been deleted');
    await expect(page.getByTestId('banner-modules')).toContainText('Core POS');
    await expect(page.getByTestId('banner-update-payment')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Point of Sale' })).toHaveCount(0); // the menu offers only what still works
    await expect(page.getByRole('link', { name: 'Subscription' })).toBeVisible();

    // Paying restores access once the (development) provider confirms the payment.
    await page.getByTestId('pm-token').fill('tok_ok');
    await page.getByTestId('pm-save').click();
    await page.getByTestId('pay-now').click();
    await expect(page.getByTestId('sub-status')).toHaveText('Active');
    await expect(page.getByTestId('account-banner')).toHaveCount(0);
    await page.getByRole('link', { name: 'Point of Sale' }).click();
    await expect(page).toHaveURL(/\/app\/pos$/);
    await expect(page.getByTestId('ledger-table')).toHaveCount(0);

    await page.goto('/app/subscription');
    await expect(page.getByTestId('ledger-table')).toContainText('Access restored');
    await expect(page.getByTestId('ledger-table')).toContainText('Payment reconciled');
    await operator.context.close();
  });

  test('a module outside the plan shows an upgrade prompt instead of failing silently', async ({ page, browser }) => {
    const who = await newCompany(page);

    // The operator builds a plan without Inventory and assigns it.
    const operator = await newContext(browser);
    await operatorSignIn(operator.page);
    await operator.page.getByTestId('nav-plans').click();
    await operator.page.getByTestId('new-plan').click();
    const code = `pos-only-${who.slug.slice(-6)}`;
    await operator.page.getByTestId('plan-code').fill(code);
    await operator.page.getByTestId('plan-name').fill('POS Only');
    await operator.page.getByTestId('plan-price').fill('1900');
    await operator.page.getByTestId('plan-module-core_pos').check();
    await operator.page.getByTestId('plan-save').click();
    await expect(operator.page.getByTestId(`plan-row-${code}`)).toContainText('POS Only');

    await openCompany(operator.page, who.slug);
    await operator.page.getByTestId('act-plan').click();
    await operator.page.getByTestId('action-plan').selectOption({ label: 'POS Only' });
    await operator.page.getByTestId('action-reason').fill('Pilot with POS only');
    await operator.page.getByTestId('action-confirm').click();
    await expect(operator.page.getByTestId('detail-plan')).toHaveText('POS Only');
    await expect(operator.page.getByTestId('mod-inventory_management')).toContainText('None');

    await page.goto('/app/pos');
    await expect(page.getByRole('link', { name: 'Point of Sale' })).toBeVisible();       // wait for the session restore to finish before judging the menu
    await expect(page.getByRole('link', { name: 'Inventory' })).toHaveCount(0); // hidden from the menu
    await page.goto('/app/inventory');                                         // typed straight into the address bar
    await expect(page).toHaveURL(/\/upgrade/);
    await expect(page.getByTestId('upgrade-prompt')).toContainText('Inventory management');
    await expect(page.getByTestId('upgrade-prompt')).toContainText('not part of your current plan');
    await page.getByTestId('upgrade-choose-plan').click();
    await expect(page).toHaveURL(/\/app\/subscription/);

    // The operator can grant it back for a while without changing the plan.
    await operator.page.getByTestId('override-inventory_management').click();
    await operator.page.getByTestId('action-reason').fill('Two-week inventory trial');
    await operator.page.getByTestId('action-confirm').click();
    await expect(operator.page.getByTestId('mod-inventory_management')).toContainText('Full');
    await page.goto('/app/inventory');
    await expect(page).toHaveURL(/\/app\/inventory$/);
    await expect(page.getByTestId('tab-stock')).toBeVisible();
    await operator.context.close();
  });

  test('platform pages need an operator sign-in and a wrong password reveals nothing', async ({ page }) => {
    await page.goto('/platform/overview');
    await expect(page).toHaveURL(/\/platform\/login$/);

    await page.getByTestId('platform-email').fill(OPERATOR_EMAIL);
    await page.getByTestId('platform-password').fill('Wrong-Passw0rd!');
    await page.getByTestId('platform-submit').click();
    await expect(page.getByTestId('platform-error')).toContainText('Email or password is incorrect');

    await page.getByTestId('platform-password').fill(OPERATOR_PASSWORD);
    await page.getByTestId('platform-submit').click();
    await expect(page.getByTestId('total-tenants')).toBeVisible();

    await page.getByTestId('platform-signout').click();
    await expect(page).toHaveURL(/\/platform\/login$/);
  });
});

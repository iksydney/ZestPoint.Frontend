import { Browser, Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi } from './helpers';

const OPERATOR_EMAIL = 'operator@zestpoint.e2e';
const OPERATOR_PASSWORD = 'Operat0r-E2E-Passw0rd!';

const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Registers a company, publishes the starter brand and lands in the app (the company starts a free trial of the top plan). */
async function newCompany(page: Page, name?: string) {
  const who = await registerViaUi(page, name ? { name } : {});
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function operatorSignIn(page: Page, email = OPERATOR_EMAIL, password = OPERATOR_PASSWORD) {
  await page.goto('/platform/login');
  await page.getByTestId('platform-email').fill(email);
  await page.getByTestId('platform-password').fill(password);
  await page.getByTestId('platform-submit').click();
  await expect(page).toHaveURL(/\/platform\/overview$/);
}

async function openCompany(page: Page, slug: string) {
  await page.getByTestId('nav-tenants').click();
  await page.getByTestId('tenant-search').fill(slug);
  await page.getByTestId('tenant-find').click();
  await page.getByTestId(`tenant-${slug}`).getByRole('link').first().click();
  await expect(page.getByTestId('access-tree')).toBeVisible();
}

/** An operator (administrator) in a fresh browser context. */
async function operatorContext(browser: Browser) {
  const operator = await newContext(browser);
  await operatorSignIn(operator.page);
  return operator;
}

/** Confirms the open dialog with a reason. The confirm button stays disabled without one (a reason is mandatory). */
async function confirmWithReason(page: Page, reason: string) {
  await expect(page.getByTestId('action-confirm')).toBeDisabled();
  await page.getByTestId('action-reason').fill(reason);
  await page.getByTestId('action-confirm').click();
}

/** Types a screen name into search, which lists exactly the screens and reports the person may use. */
async function menuOffers(page: Page, label: string): Promise<boolean> {
  await page.getByTestId('nav-search').click();
  await page.getByTestId('palette-input').fill(label);
  await expect(page.getByTestId('palette-results')).toBeVisible();
  const hit = await page.getByTestId('palette-results').getByRole('option').filter({ hasText: label }).count();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('palette')).toHaveCount(0);
  return hit > 0;
}

test.describe('Giving an organisation modules, screens and buttons, and the whole application in one click', () => {
  test('an operator withholds one screen and one button; the organisation sees the menu, the address bar and the button follow, and the grant shows as expiring', async ({ page, browser }, testInfo) => {
    test.setTimeout(240_000);
    const who = await newCompany(page);
    await page.goto('/app/inventory/bins');
    await expect(page).toHaveURL(/\/app\/inventory\/bins$/);          // allowed: nobody has changed anything yet
    await expect(page.getByTestId('bin-new')).toBeEnabled();
    expect(await menuOffers(page, 'Bin Locations')).toBe(true);

    const operator = await operatorContext(browser);
    const op = operator.page;
    await openCompany(op, who.slug);

    // 1) Withhold the Bin Locations SCREEN until tomorrow.
    await op.getByTestId('access-search').fill('Bin Locations');
    await op.getByTestId('deny-stock.bins').click();
    await op.getByTestId('action-until').fill(inDays(1));
    await confirmWithReason(op, 'Bins are being reorganised');
    await expect(op.getByTestId('state-stock.bins')).toHaveText('Withheld');
    await expect(op.getByTestId('screen-stock.bins')).toContainText('set by an operator');

    // The organisation: hidden from the menu, and a direct URL shows the plain explanation (not a blank page or a raw error).
    await page.goto('/app/dashboard');
    expect(await menuOffers(page, 'Bin Locations')).toBe(false);
    await page.goto('/app/inventory/bins');
    await expect(page).toHaveURL(/\/upgrade/);
    await expect(page.getByTestId('upgrade-screen')).toContainText('Bin Locations');
    await expect(page.getByTestId('upgrade-prompt')).toContainText('Not included in your plan');

    // The operator's overview lists what is about to end, so a time-boxed grant is never forgotten.
    await op.getByTestId('nav-overview').click();
    await expect(op.getByTestId('expiring-grants')).toContainText(who.name);
    await expect(op.getByTestId('expiring-stock.bins')).toContainText('Bin Locations');

    // 2) Take the screen rule away again, and withhold just one BUTTON of it.
    await openCompany(op, who.slug);
    await op.getByTestId('access-search').fill('Bin Locations');
    await op.getByTestId('screen-stock.bins').locator('[data-testid^="rule-remove-"]').click();
    await confirmWithReason(op, 'Reorganisation finished');
    await expect(op.getByTestId('state-stock.bins')).toHaveText('Allowed');
    await op.getByTestId('toggle-stock.bins').click();
    await op.getByTestId('deny-inventory.bins.manage').click();
    await confirmWithReason(op, 'Only managers may create bins for now');
    await expect(op.getByTestId('state-inventory.bins.manage')).toHaveText('Withheld');

    // The screen is back and the list still works, but the button is visible and unavailable, with its reason (not a silent no-op).
    await page.goto('/app/inventory/bins');
    await expect(page).toHaveURL(/\/app\/inventory\/bins$/);
    await expect(page.getByTestId('bin-new')).toBeDisabled();
    await expect(page.getByTestId('bin-new')).toHaveAttribute('title', 'Not included in your plan');
    await expect(page.getByTestId('bin-new')).toHaveAttribute('aria-disabled', 'true');
    expect(await menuOffers(page, 'Bin Locations')).toBe(true);
    await expect(page.getByTestId('bin-form')).toHaveCount(0);        // clicking it opens nothing
    await page.getByTestId('bin-new').click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The ledger names the operator and the reason for each step.
    await expect(op.getByTestId('detail-ledger')).toContainText('Bin Locations withdrawn');
    await expect(op.getByTestId('detail-ledger')).toContainText('Platform:');

    // The tree is usable on a phone, in dark mode, with no sideways page scroll.
    await op.setViewportSize({ width: 390, height: 844 });
    await op.emulateMedia({ colorScheme: 'dark' });
    await op.getByTestId('access-search').fill('');
    await expect(op.getByTestId('access-tree')).toBeVisible();
    await expect(op.getByTestId('detail-modules')).toBeVisible();
    const overflow = await op.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await op.screenshot({ path: testInfo.outputPath('access-tree-phone-dark.png'), fullPage: false });
    await operator.context.close();
  });

  test('one click grants a module, one click grants the whole application (capped at 90 days, unbuilt modules skipped) and each is reverted in one click', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const who = await newCompany(page);
    const operator = await operatorContext(browser);
    const op = operator.page;

    // A plan with only the POS, assigned to the company.
    await op.getByTestId('nav-plans').click();
    await op.getByTestId('new-plan').click();
    const code = `pos-only-${who.slug.slice(-6)}`;
    await op.getByTestId('plan-code').fill(code);
    await op.getByTestId('plan-name').fill('POS Only');
    await op.getByTestId('plan-price').fill('1900');
    await op.getByTestId('plan-module-core_pos').check();
    await op.getByTestId('plan-save').click();
    await expect(op.getByTestId(`plan-row-${code}`)).toContainText('POS Only');
    await openCompany(op, who.slug);
    await op.getByTestId('act-plan').click();
    await op.getByTestId('action-plan').selectOption({ label: 'POS Only' });
    await op.getByTestId('action-reason').fill('Pilot with POS only');
    await op.getByTestId('action-confirm').click();
    await expect(op.getByTestId('mod-inventory_management')).toContainText('None');
    await page.goto('/app/inventory');
    await expect(page).toHaveURL(/\/upgrade/);

    // The whole MODULE: its screens and buttons open, then it goes back to the plan.
    await op.getByTestId('grant-module-inventory_management').click();
    await confirmWithReason(op, 'Full pilot of stock control');
    await expect(op.getByTestId('mod-inventory_management')).toContainText('Full');
    await page.goto('/app/inventory');
    await expect(page).toHaveURL(/\/app\/inventory$/);
    await op.getByTestId('revert-module-inventory_management').click();
    await confirmWithReason(op, 'Pilot over');
    await expect(op.getByTestId('mod-inventory_management')).toContainText('None');
    await page.goto('/app/inventory');
    await expect(page).toHaveURL(/\/upgrade/);

    // The whole APPLICATION: a required end date, at most 90 days away.
    await op.getByTestId('grant-application').click();
    await expect(op.getByTestId('action-confirm')).toBeDisabled();                      // no reason yet
    await op.getByTestId('action-reason').fill('Evaluation by the owner group');
    await op.getByTestId('application-until').fill(inDays(120));
    await expect(op.getByTestId('action-confirm')).toBeDisabled();                      // too far away: the cap is enforced in the form as well as on the server
    await op.getByTestId('application-until').fill(inDays(20));
    await op.getByTestId('action-confirm').click();
    await expect(op.getByTestId('application-grant-banner')).toBeVisible();
    await expect(op.getByTestId('mod-inventory_management')).toContainText('Full');
    await expect(op.getByTestId('coming-soon')).toHaveCount(3);                         // KDS, Hotel PMS and Enterprise API have nothing built behind them: skipped
    await page.goto('/app/inventory');
    await expect(page).toHaveURL(/\/app\/inventory$/);
    await expect(page.getByTestId('tab-stock')).toBeVisible();

    // One click back, and the company follows its plan again.
    await op.getByTestId('revert-application').click();
    await confirmWithReason(op, 'Evaluation over');
    await expect(op.getByTestId('application-grant-banner')).toHaveCount(0);
    await expect(op.getByTestId('mod-inventory_management')).toContainText('None');
    await page.goto('/app/inventory');
    await expect(page).toHaveURL(/\/upgrade/);
    await expect(op.getByTestId('detail-ledger')).toContainText('Whole application granted');
    await expect(op.getByTestId('detail-ledger')).toContainText('Whole-application grant reverted');
    await operator.context.close();
  });

  test('bulk apply changes several companies at once, reports each separately and touches only the ones selected', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const prefix = `E2E Bulk ${Math.random().toString(36).slice(2, 7)}`;
    const a = await newCompany(page, `${prefix} One`);
    const second = await newContext(browser);
    const b = await newCompany(second.page, `${prefix} Two`);
    const third = await newContext(browser);
    const bystander = await newCompany(third.page, `${prefix} Three`);

    const operator = await operatorContext(browser);
    const op = operator.page;
    await op.getByTestId('nav-tenants').click();
    await op.getByTestId('tenant-search').fill(prefix);
    await op.getByTestId('tenant-find').click();
    await expect(op.getByTestId(`tenant-${a.slug}`)).toBeVisible();
    await op.getByTestId(`select-${a.slug}`).check();
    await op.getByTestId(`select-${b.slug}`).check();
    await expect(op.getByTestId('bulk-bar')).toContainText('2 company(ies) selected');

    await op.getByTestId('bulk-open').click();
    await expect(op.getByTestId('bulk-who')).toContainText(`${prefix} One`);
    await expect(op.getByTestId('bulk-who')).not.toContainText(`${prefix} Three`);
    await op.getByTestId('bulk-operation').selectOption('GrantModule');
    await op.getByTestId('bulk-module').selectOption('inventory_management');
    await expect(op.getByTestId('bulk-confirm')).toBeDisabled();                         // a reason is mandatory
    await op.getByTestId('bulk-reason').fill('Roll-out wave 1');
    await op.getByTestId('bulk-confirm').click();
    await expect(op.getByTestId('bulk-results')).toContainText('2 applied');

    // Each company's own ledger names the operator and the reason; the third company was never named, so it has nothing.
    await op.getByRole('button', { name: 'Done' }).click();
    await openCompany(op, a.slug);
    await expect(op.getByTestId('detail-ledger')).toContainText('Roll-out wave 1');
    await expect(op.getByTestId('detail-ledger')).toContainText('Platform:');
    await op.getByTestId('nav-tenants').click();
    await op.getByTestId('tenant-search').fill(bystander.slug);
    await op.getByTestId('tenant-find').click();
    await op.getByTestId(`tenant-${bystander.slug}`).getByRole('link').first().click();
    await expect(op.getByTestId('detail-ledger')).not.toContainText('Roll-out wave 1');
    await operator.context.close();
    await second.context.close();
    await third.context.close();
  });

  test('a support agent can read a company\'s access but has no way to change it', async ({ page, browser }) => {
    test.setTimeout(180_000);
    const who = await newCompany(page);

    const admin = await operatorContext(browser);
    await admin.page.getByTestId('nav-operators').click();
    await admin.page.getByTestId('op-new').click();
    const email = `agent-${Math.random().toString(36).slice(2, 8)}@zestpoint.e2e`;
    await admin.page.getByTestId('op-name').fill('Agent Ada');
    await admin.page.getByTestId('op-email').fill(email);
    await admin.page.getByTestId('op-role').selectOption('SupportAgent');
    await admin.page.getByTestId('op-password').fill('Agent-Passw0rd-123!');
    await admin.page.getByTestId('op-create').click();
    await expect(admin.page.getByTestId(`op-${email}`)).toContainText('Support agent');

    const agent = await newContext(browser);
    await operatorSignIn(agent.page, email, 'Agent-Passw0rd-123!');
    await openCompany(agent.page, who.slug);
    await expect(agent.page.getByTestId('detail-modules')).toBeVisible();               // they can see it
    await expect(agent.page.getByTestId('access-readonly')).toBeVisible();
    await expect(agent.page.getByTestId('grant-application')).toHaveCount(0);           // but nothing offers a change
    await expect(agent.page.getByTestId('grant-module-inventory_management')).toHaveCount(0);
    await agent.page.getByTestId('access-search').fill('Bin Locations');
    await expect(agent.page.getByTestId('state-stock.bins')).toHaveText('Allowed');
    await expect(agent.page.getByTestId('deny-stock.bins')).toHaveCount(0);
    await admin.context.close();
    await agent.context.close();
  });
});

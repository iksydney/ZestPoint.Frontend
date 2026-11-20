import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi, startShiftWhenAsked } from './helpers';

/**
 * Owner's decision of 2026-11-15: each branch has a list of tables. Managers set it up; the till offers it when a table bill is
 * opened, shows which tables have a bill running, and links the bill to its table. A typed name still works.
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

test.describe('Tables', () => {
  test('tables are set up per branch, offered by the till with their state, and a cashier cannot change them', async ({ page, browser }) => {
    test.slow();
    const who = await ownerInApp(page);

    // Set-up screens are behind one Set-up entry in the Admin area: a page of cards, each with a line on what it is for.
    await expect(page.getByTestId('main-nav').getByRole('link', { name: 'Tables' })).toHaveCount(0);
    await page.locator('[data-nav="setup.admin"]').click();
    await expect(page).toHaveURL(/\/app\/setup\/admin$/);
    const cards = page.getByTestId('hub-list');
    await expect(page.getByTestId('setup-admin')).toContainText('Admin set-up');
    await expect(cards.locator('a')).toHaveText([/Branches/, /Tables/, /Preparation Stations/, /Printers/, /Settings/, /Daily Summary/, /Messages/, /Branding/]);   // Messages: 2026-11-15, Printers: 2026-11-17
    await page.getByTestId('hub-filter').fill('brand');
    await expect(cards.locator('a')).toHaveCount(1);
    await page.getByTestId('hub-filter').fill('');
    await cards.locator('[data-nav="pos.tables"]').click();
    await expect(page.locator('[data-nav="setup.admin"]')).toHaveAttribute('aria-current', 'page');   // the menu marks Set-up while on one of its screens
    await expect(page.getByTestId('breadcrumb')).toContainText('Set-up');
    await expect(page).toHaveURL(/\/app\/settings\/tables$/);
    await expect(page.getByTestId('tables-empty')).toContainText('No tables yet');

    // One table, with its area and seats. Save with no name says what is missing.
    await page.getByTestId('table-new').click();
    await page.getByTestId('table-save').click();
    await expect(page.getByTestId('table-name-error')).toContainText('name or number');
    await page.getByTestId('table-name').fill('VIP 1');
    await page.getByTestId('table-area').fill('VIP');
    await page.getByTestId('table-seats').fill('8');
    await page.getByTestId('table-save').click();
    await expect(page.getByTestId('table-row-VIP 1')).toContainText('VIP');
    await expect(page.getByTestId('table-row-VIP 1')).toContainText('Free');

    // The same name again is refused by the server, in other letters too.
    await page.getByTestId('table-new').click();
    await page.getByTestId('table-name').fill('vip 1');
    await page.getByTestId('table-save').click();
    await expect(page.getByTestId('table-name-error')).toContainText('Already used');
    await page.getByTestId('table-form').getByRole('button', { name: 'Cancel' }).click();

    // Several at once.
    await page.getByTestId('table-many').click();
    await page.getByTestId('many-prefix').fill('Table');
    await page.getByTestId('many-from').fill('1');
    await page.getByTestId('many-to').fill('3');
    await page.getByTestId('many-area').fill('Terrace');
    await expect(page.getByTestId('many-preview')).toHaveText('3 table(s): Table 1 to Table 3');
    await page.getByTestId('many-save').click();
    await expect(page.getByTestId('table-row-Table 3')).toContainText('Terrace');
    await expect(page.getByTestId('table-list').locator('tbody tr')).toHaveCount(4);

    // The till offers the list, grouped by area; one tap fills the table.
    await page.goto('/app/pos');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-kind').selectOption('Table');
    const picker = page.getByTestId('nb-tables');
    await expect(picker).toContainText('Terrace');
    await expect(picker.getByTestId('nb-table-Table 2')).toHaveAttribute('data-open', '0');
    await picker.getByTestId('nb-table-Table 2').click();
    await expect(page.getByTestId('nb-table')).toHaveValue('Table 2');
    await page.getByTestId('nb-create').click();
    // A table named "Table 2" is worded "Table 2", not "Table Table 2" (FND-121).
    await expect(page.getByTestId('current-bill')).toContainText('Table 2');
    await expect(page.getByTestId('current-bill')).not.toContainText('Table Table');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });

    // Opening another bill: Table 2 now says it has a bill running. A typed name that is no table still works.
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-kind').selectOption('Table');
    await expect(page.getByTestId('nb-table-Table 2')).toHaveAttribute('data-open', '1');
    await expect(page.getByTestId('nb-table-Table 2')).toContainText('bill open');
    await page.getByTestId('nb-table').fill('By the pool');
    await page.getByTestId('nb-create').click();
    await expect(page.getByTestId('current-bill')).toContainText('Table By the pool');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });

    // Back on the Tables screen: Table 2 has a bill open and cannot be switched off; another can.
    await page.goto('/app/settings/tables');
    await expect(page.getByTestId('table-row-Table 2')).toContainText('1 bill open');
    await page.getByTestId('table-edit-Table 2').click();
    await page.getByTestId('table-active').uncheck();
    await page.getByTestId('table-save').click();
    await expect(page.getByTestId('table-error')).toContainText('still open');
    await page.getByTestId('table-form').getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('table-edit-Table 3').click();
    await page.getByTestId('table-active').uncheck();
    await page.getByTestId('table-save').click();
    await expect(page.getByTestId('table-row-Table 3')).toContainText('Switched off');

    // A cashier uses the list at the till (without the switched-off table) but has no Tables screen.
    await page.goto('/app/staff');
    await page.getByTestId('add-staff').click();
    await page.getByTestId('new-name').fill('Tunde Till');
    await page.getByTestId('new-pin').fill('7391');
    await page.getByTestId('new-role-cashier').check();
    await page.getByTestId('create-staff').click();
    const code = (await page.getByTestId('staff-added-code').innerText()).trim();
    const till = await newContext(browser);
    const c = till.page;
    await c.goto('/login');
    await c.getByTestId('login-slug').fill(who.slug);
    await c.getByTestId('mode-pin').click();
    await c.getByTestId('login-code').fill(code);
    await c.getByTestId('login-pin').fill('7391');
    await c.getByTestId('login-submit').click();
    await startShiftWhenAsked(c);
    await expect(c.locator('[data-nav="setup.admin"]')).toHaveCount(0);                    // a cashier has no set-up screens, so no Set-up entry
    await c.goto('/app/settings/tables');
    await expect(c.getByRole('heading', { name: 'No access' })).toBeVisible();
    await c.goto('/app/pos');
    await c.getByTestId('new-bill').click();
    await c.getByTestId('nb-kind').selectOption('Table');
    await expect(c.getByTestId('nb-table-Table 1')).toBeVisible();
    await expect(c.getByTestId('nb-table-Table 3')).toHaveCount(0);
    await expect(c.getByTestId('nb-table-Table 2')).toContainText('bill open');
    await till.context.close();
  });
});

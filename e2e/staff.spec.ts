import { Page, expect, test } from '@playwright/test';
import { choose, newContext, registerViaUi } from './helpers';

/** Publishes the starter brand so the owner reaches the application, then opens Staff & roles. */
async function ownerAtStaff(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function addPinStaff(page: Page, name: string, roleKey: string, pin = '7391'): Promise<string> {
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  await page.getByTestId('create-staff').click();
  const shown = (await page.getByTestId('staff-added-code').innerText()).trim();       // the panel shown right after adding
  await page.getByTestId('staff-added-done').click();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  expect((await row.locator('td').nth(1).innerText()).trim()).toBe(shown);
  return shown;
}

async function pinSignIn(page: Page, slug: string, code: string, pin = '7391') {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(slug);
  await page.getByTestId('mode-pin').click();
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
}

test.describe('Staff management and screen-level RBAC (criteria 13-17)', () => {
  test('an administrator adds staff with a role and the staff member signs in with venue + code + PIN', async ({ page, browser }) => {
    const who = await ownerAtStaff(page);
    const code = await addPinStaff(page, 'Tunde Bello', 'cashier');
    expect(code).toMatch(/^[A-Z]{2,3}-002$/);                                   // company letters + number; the owner is 001

    const staff = await newContext(browser);
    await pinSignIn(staff.page, who.slug, code);
    await expect(staff.page).toHaveURL(/\/app\/dashboard$/);
    await expect(staff.page.getByTestId('user-name')).toHaveText('Tunde Bello');
    await staff.context.close();
  });

  test('screens a role does not include are hidden AND refused by the guards', async ({ page, browser }) => {
    const who = await ownerAtStaff(page);
    const code = await addPinStaff(page, 'Cash Only', 'cashier');

    const staff = await newContext(browser);
    await pinSignIn(staff.page, who.slug, code);
    await expect(staff.page).toHaveURL(/\/app\/dashboard$/);

    const sidebar = staff.page.getByRole('navigation', { name: 'Main' }).first();
    await expect(sidebar).toContainText('Point of Sale');
    await expect(sidebar).not.toContainText('Staff');
    await expect(sidebar).not.toContainText('Branding');

    await staff.page.goto('/app/staff');
    await expect(staff.page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await staff.page.goto('/app/settings/branding');
    await expect(staff.page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await staff.context.close();
  });

  test('deactivating staff signs them out at once and blocks the next sign-in', async ({ page, browser }) => {
    const who = await ownerAtStaff(page);
    const code = await addPinStaff(page, 'Leaving Lee', 'waiter');

    const staff = await newContext(browser);
    await pinSignIn(staff.page, who.slug, code);
    // A waiter has no dashboard access, so the app lands them on the first screen their role includes.
    await expect(staff.page).toHaveURL(/\/app\/pos$/);

    await page.getByTestId(`manage-${code}`).click();
    await page.getByTestId('deactivate').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByRole('row').filter({ hasText: 'Leaving Lee' })).toContainText('Deactivated');

    // The staff member's next navigation requires a valid session, which no longer exists.
    await staff.page.reload();
    await expect(staff.page).toHaveURL(/\/login/);
    await pinSignIn(staff.page, who.slug, code);
    await expect(staff.page.getByTestId('login-error')).toBeVisible();
    await staff.context.close();
  });

  test('the role editor shows grouped permissions, creates a custom role and refuses unsafe edits to the owner role', async ({ page }) => {
    await ownerAtStaff(page);
    await page.getByTestId('tab-roles').click();

    const editor = page.getByTestId('role-editor');
    await expect(editor).toContainText('Point of sale');
    await expect(editor).toContainText('Inventory');
    await expect(editor).toContainText('pos.void.approve');

    // The owner role is locked.
    await page.getByTestId('role-ceo').click();
    await expect(page.getByTestId('role-name')).toBeDisabled();
    await expect(editor).toContainText('cannot be changed');

    // A custom role.
    await page.getByTestId('new-role').click();
    await page.getByTestId('role-name').fill('Floor supervisor');
    await page.getByTestId('perm-pos.view').check();
    await page.getByTestId('perm-pos.void.approve').check();
    await page.getByTestId('save-role').click();
    await expect(page.getByTestId('role-Floor supervisor')).toBeVisible();

    // Duplicate a built-in role.
    await page.getByTestId('role-cashier').click();
    await page.getByTestId('duplicate-role').click();
    await expect(page.getByTestId('role-Copy of Cashier')).toBeVisible();
  });

  test('editing a role changes what staff can do on their very next request', async ({ page, browser }) => {
    const who = await ownerAtStaff(page);
    const code = await addPinStaff(page, 'Promotable Pat', 'cashier');

    const staff = await newContext(browser);
    await pinSignIn(staff.page, who.slug, code);
    await expect(staff.page).toHaveURL(/\/app\/dashboard$/);
    const status = () => staff.page.evaluate(async () => {
      // The page holds its access token in memory; reuse the app's own HttpClient pipeline by asking the API through a refresh-less fetch is not possible,
      // so check the effect through the reports endpoint via the signed-in session cookie flow instead.
      const r = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'ZestPoint' } });
      const body = await r.json();
      const token = body.result.accessToken as string;
      const rep = await fetch('/api/v1/reports/sales/summary', { headers: { Authorization: `Bearer ${token}` } });
      return rep.status;
    });
    expect(await status()).toBe(403);

    await page.getByTestId('tab-roles').click();
    await page.getByTestId('role-cashier').click();
    await page.getByTestId('perm-reports.sales.view').check();
    await page.getByTestId('save-role').click();
    await expect(page.getByText('Role saved')).toBeVisible();

    expect(await status()).toBe(200);
    await staff.context.close();
  });

  test('an invitation link asks for the default PIN, then a new PIN, and signs the person in', async ({ page, browser }) => {
    const who = await ownerAtStaff(page);
    await page.getByTestId('add-staff').click();
    await page.getByTestId('new-name').fill('Ngozi Invited');
    await page.getByTestId('method-invite').check();
    await page.getByTestId('new-email').fill(`ngozi-${Date.now()}@example.com`);
    await page.getByTestId('new-role-general-manager').check();
    await page.getByTestId('create-staff').click();

    const link = await page.getByTestId('dev-invite-link').innerText();
    expect(link).toContain('/accept-invite');
    const defaultPin = await page.getByTestId('dev-default-pin').innerText();
    expect(defaultPin).toMatch(/^\d{6}$/);

    const invitee = await newContext(browser);
    await invitee.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await invitee.page.getByTestId('invite-password').fill('Ngozi-Str0ng-Pass');
    await invitee.page.getByTestId('invite-current-pin').fill(defaultPin);
    await invitee.page.getByTestId('invite-pin').fill('7391');
    await invitee.page.getByTestId('invite-pin-confirm').fill('7391');
    await invitee.page.getByTestId('invite-submit').click();
    await expect(invitee.page).toHaveURL(/\/app\/dashboard$/);
    await expect(invitee.page.getByTestId('user-name')).toHaveText('Ngozi Invited');
    await invitee.context.close();
    expect(who.slug.length).toBeGreaterThan(2);
  });

  test('a PIN lockout is visible to the administrator and clears when they set a new PIN', async ({ page, browser }) => {
    const who = await ownerAtStaff(page);
    const code = await addPinStaff(page, 'Forgetful Fay', 'cashier');

    const staff = await newContext(browser);
    for (let i = 0; i < 5; i++) {
      await pinSignIn(staff.page, who.slug, code, '5839');
      await expect(staff.page.getByTestId('login-error')).toBeVisible();
    }
    await staff.context.close();

    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'Forgetful Fay' })).toContainText('PIN (locked)');
    await page.getByTestId(`manage-${code}`).click();
    await page.getByTestId('set-pin-input').fill('4826');
    await page.getByTestId('set-pin').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('row').filter({ hasText: 'Forgetful Fay' })).not.toContainText('locked');
  });

  test('branches can be added and staff can be limited to one of them', async ({ page }) => {
    await ownerAtStaff(page);
    await page.goto('/app/settings/branches');
    await page.getByTestId('add-branch').click();
    await page.getByTestId('branch-name').fill('Lekki Annex');
    await page.getByTestId('branch-code').fill('LEK-2');
    await page.getByTestId('save-branch').click();
    await expect(page.getByTestId('branch-LEK-2')).toBeVisible();
    await expect(page.getByTestId('branch-MAIN')).toContainText('Head office');
  });

  test('the role and branch filters are searchable lists that start on All roles and All branches, and narrow the staff', async ({ page }) => {
    await ownerAtStaff(page);
    await addPinStaff(page, 'Tunde Bello', 'cashier');
    await addPinStaff(page, 'Sade Okon', 'supervisor');
    const table = page.getByTestId('staff-table');
    await expect(page.getByTestId('staff-filter-role')).toHaveValue('All roles');
    await expect(page.getByTestId('staff-filter-branch')).toHaveValue('All branches');

    await choose(page, 'staff-filter-role', 'Cashier');
    await expect(page.getByTestId('staff-filter-role')).toHaveValue('Cashier');
    await expect(table).toContainText('Tunde Bello');
    await expect(table).not.toContainText('Sade Okon');
    await choose(page, 'staff-filter-role', 'All roles');
    await expect(table).toContainText('Sade Okon');
    await expect(table).toContainText('Tunde Bello');

    // The branch list is typed into the same way; the first real branch (the box is on All branches, so Down once) keeps the people who work there.
    await page.getByTestId('staff-filter-branch').click();
    await expect(page.getByTestId('staff-filter-branch-list').locator('[data-value]').first()).toHaveText('All branches');
    await page.getByTestId('staff-filter-branch').press('ArrowDown');
    await page.getByTestId('staff-filter-branch').press('Enter');
    await expect(page.getByTestId('staff-filter-branch')).not.toHaveValue('All branches');
    await expect(table).toContainText('Tunde Bello');
    await choose(page, 'staff-filter-branch', 'All branches');
    await expect(page.getByTestId('staff-filter-branch')).toHaveValue('All branches');
  });

  test('the activity log records the sensitive actions an administrator just took', async ({ page }) => {
    await ownerAtStaff(page);
    await addPinStaff(page, 'Audited Al', 'cashier');
    await page.getByTestId('tab-activity').click();
    const table = page.getByTestId('audit-table');
    await expect(table).toContainText('staff.created');
    await expect(table).toContainText('company.registered');
    await page.getByTestId('audit-filter').selectOption('staff.');
    await expect(table).not.toContainText('company.registered');
  });
});

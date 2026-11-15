import { Page, expect, test } from '@playwright/test';
import { Registered, newContext, registerViaUi, startShiftWhenAsked } from './helpers';

/**
 * Owner's decisions of 2026-11-15:
 *  - a cashier who signs in with no shift running must start one (the box cannot be put aside);
 *  - My Sales lists a person's own bills, with filters and each bill's receipt to share; nobody sees a colleague's, supervisors and
 *    above can choose whose to look at;
 *  - a shift that has run six hours brings a reminder to end it, and again an hour after "Still working".
 */

async function shopWithDemoData(page: Page): Promise<Registered> {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await page.goto('/app/settings/operations');
  await page.getByTestId('seed-demo').click();
  await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);
  return who;
}

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

/** A bill with a name, so many tins of beans, paid in cash. */
async function sellBeans(page: Page, label: string, count: number): Promise<void> {
  await page.goto('/app/pos');
  await expect(page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  await expect(page.getByTestId('current-bill')).toContainText(label);
  for (let i = 0; i < count; i++) await page.getByTestId('product-Demo Canned Beans').click();
  await page.getByTestId('pay').click();
  await page.getByTestId('pay-confirm').click();
  await expect(page.getByTestId('bill-status')).toHaveText('Paid');
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('My Sales and the shift boxes', () => {
  test('a cashier must start a shift, then sees and shares only their own sales; a supervisor can look at anyone\'s', async ({ page, browser }) => {
    test.slow();   // four signed-in people
    const who = await shopWithDemoData(page);
    const adaCode = await addPinStaff(page, 'Ada Cashier', 'cashier', '4826');
    const benCode = await addPinStaff(page, 'Ben Cashier', 'cashier', '5937');
    const supCode = await addPinStaff(page, 'Sade Super', 'supervisor', '6148');

    // Ada signs in with no shift: the box is there and nothing behind it can be used until she starts one.
    const ada = await newContext(browser);
    const a = ada.page;
    await pinSignIn(a, who.slug, adaCode, '4826');
    const box = a.getByTestId('shift-box');
    await expect(box).toContainText('Start your shift');
    await expect(box).toContainText('Ada Cashier');
    await expect(box.getByTestId('shift-box-start')).toBeDisabled();                   // the drawer has not been counted yet
    await a.keyboard.press('Escape');
    await expect(box).toBeVisible();                                                    // it cannot be put aside
    await expect(a.getByTestId('main-nav')).toHaveCount(1);
    expect(await a.evaluate(() => !!document.querySelector('[data-testid="main-nav"]')?.closest('[inert]'))).toBe(true);
    await startShiftWhenAsked(a, '5000');

    // The shift is running: Start / End of Day shows it, and signing in again does not ask.
    await a.goto('/app/pos/day-management');
    await expect(a.getByTestId('day-current')).toBeVisible();
    await expect(a.getByTestId('day-till')).toContainText('Till 1');
    await a.reload();
    await expect(a.getByTestId('day-current')).toBeVisible();
    await expect(a.getByTestId('shift-box')).toHaveCount(0);

    await sellBeans(a, 'Party', 2);
    await sellBeans(a, 'Counter', 1);

    // My Sales is in her menu: both bills, her figures, no staff picker.
    await a.getByTestId('main-nav').getByRole('link', { name: 'My Sales' }).click();
    await expect(a).toHaveURL(/\/app\/pos\/my-sales/);
    const table = a.getByTestId('report-table');
    await expect(table).toContainText('Party');
    await expect(table).toContainText('Counter');
    await expect(table).toContainText('Served and took payment');
    await expect(a.getByTestId('report-summary')).toContainText('Payments taken');
    await expect(a.getByTestId('report-summary')).toContainText('2,700.00');            // 3 tins at 900
    await expect(a.getByTestId('filter-staff')).toHaveCount(0);

    // Filtering finds one bill; its receipt opens with the ways to send it to the customer.
    await a.getByTestId('filter-search').fill('party');
    await a.getByTestId('filter-apply').click();
    await expect(table).toContainText('Party');
    await expect(table).not.toContainText('Counter');
    await a.locator('[data-testid^="sale-receipt-"]').first().click();
    const receipt = a.getByTestId('sale-receipt');
    await expect(receipt.getByTestId('receipt-view')).toContainText('Demo Canned Beans');
    await expect(receipt.getByTestId('receipt-whatsapp')).toHaveAttribute('href', /wa\.me/);
    await expect(receipt.getByTestId('receipt-email')).toHaveAttribute('href', /^mailto:/);
    await expect(receipt.getByTestId('receipt-qr')).toBeVisible();
    await expect(receipt.getByTestId('reprint')).toBeVisible();

    // Ben, another cashier, sees none of it.
    const ben = await newContext(browser);
    const b = ben.page;
    await pinSignIn(b, who.slug, benCode, '5937');
    await startShiftWhenAsked(b);
    await b.goto('/app/pos/my-sales');
    await expect(b.getByTestId('report-empty')).toBeVisible();
    await expect(b.getByTestId('filter-staff')).toHaveCount(0);
    await b.goto(`/app/pos/my-sales?staffId=00000000-0000-0000-0000-000000000001`);     // asking for someone else by address is refused by the server
    await expect(b.getByTestId('report-error')).toContainText('your own sales only');
    await ben.context.close();

    // The supervisor is not asked to start a shift, and can choose whose sales to see.
    const sup = await newContext(browser);
    const s = sup.page;
    await pinSignIn(s, who.slug, supCode, '6148');
    await s.goto('/app/pos/my-sales');
    await expect(s.getByTestId('report-empty')).toBeVisible();                          // the supervisor sold nothing
    await expect(s.getByTestId('shift-box')).toHaveCount(0);
    await s.getByTestId('filter-staff').selectOption({ label: 'Ada Cashier' });
    await s.getByTestId('filter-apply').click();
    await expect(s.getByTestId('report-table')).toContainText('Party');
    await expect(s.getByTestId('report-table')).toContainText('Counter');
    await s.locator('[data-testid^="sale-receipt-"]').first().click();
    await expect(s.getByTestId('sale-receipt').getByTestId('receipt-view')).toContainText('Demo Canned Beans');
    await sup.context.close();
    await ada.context.close();
  });

  test('a shift that has run six hours brings a reminder, again an hour after "Still working", and End takes them to close it', async ({ page, browser }) => {
    const who = await shopWithDemoData(page);
    const code = await addPinStaff(page, 'Long Shift Lola', 'cashier', '4826');

    const till = await newContext(browser);
    const p = till.page;
    await pinSignIn(p, who.slug, code, '4826');
    await startShiftWhenAsked(p, '1000');
    await expect(p.getByTestId('shift-reminder')).toHaveCount(0);                       // a fresh shift is not reminded

    // Six hours and a minute later (the device's clock is moved; the shift's start time is the server's).
    await p.clock.install({ time: new Date(Date.now() + 6 * 3_600_000 + 60_000) });
    await p.reload();
    const reminder = p.getByTestId('shift-reminder');
    await expect(reminder).toContainText('Remember to end your shift');
    await expect(reminder.getByTestId('shift-reminder-hours')).toHaveText('6 hours');
    await reminder.getByTestId('shift-reminder-working').click();
    await expect(reminder).toHaveCount(0);

    // Not again straight away, even after a reload; an hour later it is back.
    await p.reload();
    await expect(p.getByTestId('user-name')).toBeVisible();
    await expect(reminder).toHaveCount(0);
    await p.clock.fastForward('01:01:00');
    await expect(reminder).toBeVisible();
    await expect(reminder.getByTestId('shift-reminder-hours')).toHaveText('7 hours');

    // "End my shift now" goes to where the drawer is counted and the shift closed.
    await reminder.getByTestId('shift-reminder-end').click();
    await expect(p).toHaveURL(/\/app\/pos\/day-management$/);
    await expect(reminder).toHaveCount(0);
    await expect(p.getByTestId('day-close')).toBeVisible();
    await till.context.close();
  });
});

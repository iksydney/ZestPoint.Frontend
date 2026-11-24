import { Page, expect, test } from '@playwright/test';
import { choose, contrastOf, newContext, openPos, registerViaUi, startShiftWhenAsked } from './helpers';

/**
 * Owner's rule of 2026-11-15, changed on 2026-11-24 (modal answers): people who sell or take orders are signed in freely, but the moment they open the
 * Point of Sale they must START A SHIFT (an opening float).
 *  - WHEN: when they open the Point of Sale, not at sign-in; every other screen opens without a shift.
 *  - WHO: everyone who sells or takes orders (the session holds pos.order.create or pos.payment.process): cashiers, bar attendants, waiters, and
 *    supervisors, managers or the owner when they open it. Kitchen staff and bartenders, who neither sell nor take orders, are not held.
 *  - THE BOX is the same for everyone: the opening float and "I have counted the drawer and this amount is right", even for a waiter with no cash.
 *  - The six-hour reminder is unchanged (my-sales-and-shift.spec.ts walks it); the server still decides what it accepts.
 * The box stands where the till would be (the till is not built until the shift has started), with a plain way back and Sign out, and the rest of
 * the application is not made inert.
 */

async function ownerAtStaff(page: Page, opts: { type?: string; barManMethod?: boolean } = {}) {
  const who = await registerViaUi(page, opts);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function addPinStaff(page: Page, name: string, roleLabel: string, pin: string): Promise<string> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByLabel(roleLabel, { exact: true }).check();
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

/** Closes the person's own shift on Start / End of Day with the drawer counted at `counted`. */
async function closeShift(page: Page, counted: string): Promise<void> {
  await expect(page.getByTestId('day-close')).toBeVisible();
  await page.getByTestId('close-count').fill(counted);
  await page.getByTestId('close-confirm').check();
  await page.getByTestId('close-btn').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('day-start')).toBeVisible();                             // no shift is running any more
}

test.describe('The shift is asked for when the Point of Sale is opened', () => {
  test('a cashier signs in freely, no other screen asks, and the Point of Sale holds them until the float is counted and the shift started', async ({ page, browser }) => {
    test.slow();
    const who = await ownerAtStaff(page);
    const code = await addPinStaff(page, 'Cora Cash', 'Cashier', '4826');

    const cashier = await newContext(browser);
    const p = cashier.page;
    await pinSignIn(p, who.slug, code, '4826');

    // Signing in is free, and so is every screen but the till: no box, nothing locked.
    await expect(p).toHaveURL(/\/app\/dashboard$/);
    await expect(p.getByTestId('shift-box')).toHaveCount(0);
    for (const url of ['/app/pos/day-management', '/app/pos/my-sales', '/app/customers']) {
      await p.goto(url);
      await expect(p.locator('main h1').first(), url).toBeVisible();
      await expect(p.getByTestId('shift-box'), url).toHaveCount(0);
      await expect(p.getByTestId('shift-gate'), url).toHaveCount(0);
    }
    await p.goto('/app/pos/day-management');
    await expect(p.getByTestId('day-start')).toBeVisible();                               // Start / End of Day has its own form, and it is not the till

    // The till: the box stands where it would be. Nothing of the till is there, the rest of the application is not locked, and there is a way back.
    await p.goto('/app/dashboard');
    await p.evaluate(() => { (window as unknown as { __notReloaded: boolean }).__notReloaded = true; });
    await p.getByTestId('main-nav').getByRole('link', { name: 'Point of Sale' }).click();
    const gate = p.getByTestId('shift-gate');
    await expect(gate).toHaveAttribute('data-state', 'start');
    const box = p.getByTestId('shift-box');
    await expect(box).toContainText('Start your shift');
    await expect(box).toContainText('Cora Cash');
    await expect(p.getByTestId('shift-box-till')).toContainText('given the next free one');
    await expect(box.getByTestId('shift-box-start')).toBeDisabled();                      // the drawer has not been counted yet
    await expect(p.getByTestId('bill-list')).toHaveCount(0);
    await expect(p.getByTestId('product-grid')).toHaveCount(0);
    await p.keyboard.press('Escape');
    await expect(box).toBeVisible();                                                      // it cannot be put aside
    expect(await p.evaluate(() => !!document.querySelector('[data-testid="main-nav"]')?.closest('[inert]'))).toBe(false);
    await expect(p.getByTestId('shift-box-signout')).toBeVisible();

    // The way back leads to the Dashboard and never into selling; the till asks again when it is opened again.
    await expect(p.getByTestId('shift-gate-back')).toHaveText('Back to the Dashboard');
    await p.getByTestId('shift-gate-back').click();
    await expect(p).toHaveURL(/\/app\/dashboard$/);
    await expect(p.getByTestId('shift-box')).toHaveCount(0);
    await p.getByTestId('main-nav').getByRole('link', { name: 'Point of Sale' }).click();
    await expect(p.getByTestId('shift-box')).toBeVisible();

    // The float and the tick: the button stays off until the drawer is said to be counted. Starting opens the till with no reload.
    await box.getByTestId('shift-box-float').fill('150');
    await expect(box.getByTestId('shift-box-start')).toBeDisabled();
    await box.getByTestId('shift-box-confirm').check();
    await expect(box.getByTestId('shift-box-start')).toBeEnabled();
    await box.getByTestId('shift-box-start').click();
    await expect(p.getByTestId('bill-list')).toBeVisible();
    await expect(p.getByTestId('shift-gate')).toHaveCount(0);
    expect(await p.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded)).toBe(true);

    // The shift is the one that was started: a till, the float, and it is not asked for again, on a reload either.
    await p.getByTestId('main-nav').getByRole('link', { name: 'Start / End of Day' }).click();
    await expect(p.getByTestId('day-till')).toContainText('Till 1');
    await expect(p.getByTestId('day-expected')).toContainText('150.00');
    await p.goto('/app/pos');
    await expect(p.getByTestId('bill-list')).toBeVisible();
    await expect(p.getByTestId('shift-box')).toHaveCount(0);
    await cashier.context.close();
  });

  test('the owner who opens the Point of Sale is held as well, and so is a waiter, who can end the shift from Start / End of Day and by the six-hour reminder', async ({ page, browser }) => {
    test.slow();
    const who = await ownerAtStaff(page);
    const waiterCode = await addPinStaff(page, 'Wale Waiter', 'Waiter / Server', '7391');

    // The owner sells too, so the till asks the owner.
    await page.goto('/app/pos');
    await expect(page.getByTestId('shift-gate')).toHaveAttribute('data-state', 'start');
    await expect(page.getByTestId('shift-box')).toContainText('Ada Obi');
    await startShiftWhenAsked(page, '1000');
    await expect(page.getByTestId('bill-list')).toBeVisible();

    // A waiter takes no payment and holds no cash, and is asked the same: right after signing in, since the waiter's first screen is the till.
    const waiter = await newContext(browser);
    const w = waiter.page;
    await pinSignIn(w, who.slug, waiterCode, '7391');
    await expect(w.getByTestId('shift-gate')).toHaveAttribute('data-state', 'start');
    await expect(w.getByTestId('shift-box')).toContainText('Wale Waiter');
    await expect(w.getByTestId('bill-list')).toHaveCount(0);
    await expect(w.getByTestId('shift-gate-back')).toContainText('Start / End of Day');   // a waiter has no Dashboard: the way back is the next screen they may use
    await startShiftWhenAsked(w, '0');
    await expect(w.getByTestId('bill-list')).toBeVisible();

    // The waiter finds Start / End of Day in the menu and ends the shift there (no payment right is needed).
    await w.getByTestId('main-nav').getByRole('link', { name: 'Start / End of Day' }).click();
    await expect(w.getByTestId('day-current')).toBeVisible();
    await expect(w.getByTestId('day-till')).toBeVisible();
    await closeShift(w, '0');
    await expect(w.getByTestId('day-history')).toContainText('Closed');

    // With no shift the till asks again; a second shift is ended through the reminder that comes after six hours, on a screen that is not the till.
    await w.getByTestId('main-nav').getByRole('link', { name: 'Point of Sale' }).click();
    await startShiftWhenAsked(w, '0');
    await w.clock.install({ time: new Date(Date.now() + 6 * 3_600_000 + 60_000) });
    await w.goto('/app/pos/my-sales');
    const reminder = w.getByTestId('shift-reminder');
    await expect(reminder).toContainText('Remember to end your shift');
    await reminder.getByTestId('shift-reminder-end').click();
    await expect(w).toHaveURL(/\/app\/pos\/day-management$/);
    await expect(reminder).toHaveCount(0);
    await closeShift(w, '0');
    await waiter.context.close();
  });

  test('a person who takes orders but may not start a shift is told so plainly and cannot open the till; kitchen staff are not held at all', async ({ page, browser }) => {
    test.slow();
    const who = await ownerAtStaff(page, { type: 'Nightclub', barManMethod: true });

    // A role made by the company that can take orders but holds no shift right (and may look at its own sales, so it has somewhere to go back to).
    await page.getByTestId('tab-roles').click();
    await page.getByTestId('new-role').click();
    await page.getByTestId('role-name').fill('Order taker');
    for (const key of ['pos.view', 'pos.order.create', 'pos.order.edit', 'pos.sales.view_own']) await page.getByTestId(`perm-${key}`).check();
    await page.getByTestId('save-role').click();
    await expect(page.getByTestId('role-Order taker')).toBeVisible();
    const orderCode = await addPinStaff(page, 'Olu Orders', 'Order taker', '5927');
    const cookCode = await addPinStaff(page, 'Kemi Cook', 'Kitchen Staff', '3846');

    const olu = await newContext(browser);
    const o = olu.page;
    await pinSignIn(o, who.slug, orderCode, '5927');
    const cannot = o.getByTestId('shift-gate-cannot');
    await expect(cannot).toContainText('You need the right to start a shift before you can sell. Ask a manager to give it to you.');
    await expect(o.getByTestId('shift-gate')).toHaveAttribute('data-state', 'cannot');
    await expect(o.getByTestId('shift-box')).toHaveCount(0);                              // there is nothing to fill in
    await expect(o.getByTestId('bill-list')).toHaveCount(0);                              // and the till is not there
    await expect(o.getByTestId('shift-box-signout')).toBeVisible();
    await o.getByTestId('shift-gate-back').click();                                       // the way back is the next screen this role may use
    await expect(o).toHaveURL(/\/app\/pos\/my-sales$/);
    await o.getByTestId('main-nav').getByRole('link', { name: 'Point of Sale' }).click();
    await expect(o.getByTestId('shift-gate-cannot')).toBeVisible();                       // still closed on another try
    await olu.context.close();

    // Kitchen staff neither sell nor take orders: the till, Bar Orders and the Kitchen Display open for them with no shift.
    const cook = await newContext(browser);
    const k = cook.page;
    await pinSignIn(k, who.slug, cookCode, '3846');
    await expect(k.getByTestId('bill-list')).toBeVisible();
    await expect(k.getByTestId('shift-gate')).toHaveCount(0);
    await expect(k.getByTestId('shift-box')).toHaveCount(0);
    for (const url of ['/app/pos/bar-orders', '/app/pos/kitchen']) {
      await k.goto(url);
      await expect(k.locator('main h1').first(), url).toBeVisible();
      await expect(k.getByTestId('shift-gate'), url).toHaveCount(0);
      await expect(k.getByTestId('shift-box'), url).toHaveCount(0);
    }
    await cook.context.close();
  });

  test('a shift that is running at another branch is said so plainly, and the till opens again at the branch where it runs', async ({ page }) => {
    test.slow();
    await ownerAtStaff(page);
    await page.goto('/app/settings/branches');
    await page.getByTestId('add-branch').click();
    await page.getByTestId('branch-name').fill('Ikeja');
    await page.getByTestId('branch-code').fill('IKJ');
    await page.getByTestId('save-branch').click();
    await page.getByTestId('bp-done').click();

    await openPos(page, '200');                                                           // a shift at the main branch
    await choose(page, 'branch-picker', 'Ikeja');
    const other = page.getByTestId('shift-gate-other-branch');
    await expect(other).toContainText('Main branch');
    await expect(other).toContainText('only one shift at a time');
    await expect(page.getByTestId('shift-gate')).toHaveAttribute('data-state', 'other-branch');
    await expect(page.getByTestId('shift-box')).toHaveCount(0);                           // a second shift cannot be started, so nothing is offered
    await expect(page.getByTestId('bill-list')).toHaveCount(0);
    await expect(page.getByTestId('shift-gate-day')).toBeVisible();

    await choose(page, 'branch-picker', 'Main branch');
    await expect(page.getByTestId('bill-list')).toBeVisible();
    await expect(page.getByTestId('shift-gate')).toHaveCount(0);
  });

  test('a company whose plan withholds Start / End of Day is not asked for a shift: nobody could start one', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const who = await ownerAtStaff(page);
    const operator = await newContext(browser);
    const op = operator.page;
    await op.goto('/platform/login');
    await op.getByTestId('platform-email').fill('operator@zestpoint.e2e');
    await op.getByTestId('platform-password').fill('Operat0r-E2E-Passw0rd!');
    await op.getByTestId('platform-submit').click();
    await expect(op).toHaveURL(/\/platform\/overview$/);
    await op.getByTestId('nav-tenants').click();
    await op.getByTestId('tenant-search').fill(who.slug);
    await op.getByTestId('tenant-find').click();
    await op.getByTestId(`tenant-${who.slug}`).getByRole('link').first().click();
    await expect(op.getByTestId('access-tree')).toBeVisible();
    await op.getByTestId('access-search').fill('Start / End of Day');
    await op.getByTestId('deny-pos.day').click();
    await op.getByTestId('action-reason').fill('The company does not use shifts');
    await op.getByTestId('action-confirm').click();
    await expect(op.getByTestId('state-pos.day')).toHaveText('Withheld');
    await operator.context.close();

    // The company's next load: the till opens at once, with no box, and Start / End of Day is not in the menu.
    await page.goto('/app/pos');
    await expect(page.getByTestId('bill-list')).toBeVisible();
    await expect(page.getByTestId('shift-gate')).toHaveCount(0);
    await expect(page.getByTestId('main-nav').getByRole('link', { name: 'Start / End of Day' })).toHaveCount(0);
  });

  test('the box is readable in a dark and in a light company, and fits a 390 px phone', async ({ page, browser }) => {
    test.slow();
    // A bar is dark, a restaurant is light.
    await ownerAtStaff(page);
    await page.goto('/app/pos');
    const box = page.getByTestId('shift-box');
    await expect(box).toBeVisible();
    await box.getByTestId('shift-box-float').fill('100');
    await box.getByTestId('shift-box-confirm').check();                                   // so that the Start button is enabled and its words are held to the rule
    await expectReadable(page, 'dark');

    // 390 px: nothing wider than the screen, the box inside it, and a button big enough for a thumb.
    await page.setViewportSize({ width: 390, height: 844 });
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    const frame = (await box.boundingBox())!;
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(390);
    const start = (await box.getByTestId('shift-box-start').boundingBox())!;
    expect(start.height).toBeGreaterThanOrEqual(44);
    for (const id of ['shift-gate-back', 'shift-box-signout']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, id).toBeLessThanOrEqual(390);
    }

    const light = await newContext(browser);
    await ownerAtStaff(light.page, { type: 'Restaurant' });
    await light.page.goto('/app/pos');
    const lightBox = light.page.getByTestId('shift-box');
    await expect(lightBox).toBeVisible();
    await lightBox.getByTestId('shift-box-float').fill('100');
    await lightBox.getByTestId('shift-box-confirm').check();
    await expectReadable(light.page, 'light');
    await light.context.close();
  });
});

/** Every piece of text in the box meets the 4.5 to 1 rule against what is really behind it, and the page is in the theme the company was given. */
async function expectReadable(page: Page, theme: 'dark' | 'light'): Promise<void> {
  const luminance = await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector('[data-testid="shift-box"]')!).backgroundColor.match(/\d+/g)!.map(Number);
    return (0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!) / 255;
  });
  expect(luminance < 0.5 ? 'dark' : 'light').toBe(theme);
  for (const selector of ['main h1', '[data-testid="shift-box"] h2', '[data-testid="shift-box"] p', '[data-testid="shift-box-till"]', '[data-testid="shift-box"] label.app-label',
    '[data-testid="shift-box"] label span', '[data-testid="shift-box-start"]', '[data-testid="shift-gate-back"]', '[data-testid="shift-box-signout"]']) {
    expect(await contrastOf(page, selector), `${theme}: ${selector}`).toBeGreaterThanOrEqual(4.5);
  }
}

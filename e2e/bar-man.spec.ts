import { Page, expect, test } from '@playwright/test';
import { Registered, newContext, pick, registerViaUi } from './helpers';

/**
 * The bar man method: an attendant sends an order, a bar man gets it live on another device, dispatches it (stock is deducted then),
 * and the attendant is told which table is ready. Three people on three browser contexts, against the real API and its live hub.
 */

/** A nightclub (a bar-type business) that answered the question at registration, published its brand and loaded the labelled demonstration products and stock. */
async function barWithDemoData(page: Page, barManMethod = true): Promise<Registered> {
  const who = await registerViaUi(page, { type: 'Nightclub', barManMethod });
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

/** The attendant opens a table and adds one Demo Gin & Tonic per entry (its option dialog is accepted as it stands). */
async function tableWith(page: Page, table: string, ...products: string[]): Promise<void> {
  await page.goto('/app/pos');
  await expect(page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-kind').selectOption('Table');
  await page.getByTestId('nb-table').fill(table);
  await page.getByTestId('nb-create').click();
  await expect(page.getByTestId('current-bill')).toContainText(`table ${table}`);
  for (const product of products) {
    await page.getByTestId(`product-${product}`).click();
    if (product === 'Demo Gin & Tonic') await page.getByTestId('mod-add').click();
  }
}

/** The labels of the Sell area of the menu, opened first so a hidden entry is really absent and not just folded away. */
async function posMenu(page: Page): Promise<string[]> {
  const header = page.getByTestId('nav-group-sell');
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  return page.locator('[data-group-list="sell"] a span.truncate').allInnerTexts();
}

async function ginOnHand(page: Page): Promise<string> {
  await page.goto('/app/inventory');
  const row = page.getByTestId('item-Demo Gin 700ml');
  await expect(row).toBeVisible();
  return (await row.getByTestId('on-hand').innerText()).replace(/\s+/g, ' ');
}

test.describe('Bar man method', () => {
  test('only a bar-type business is asked, and it must answer before it can continue', async ({ page }) => {
    await page.goto('/register');

    await pick(page, 'enterprise-type', 'Supermarket');
    await expect(page.getByTestId('bar-man-question')).toHaveCount(0);
    await expect(page.getByTestId('next')).toBeEnabled();

    await pick(page, 'enterprise-type', 'Nightclub');
    await expect(page.getByTestId('bar-man-question')).toContainText('Will you use the bar man method?');
    await expect(page.getByTestId('next')).toBeDisabled();
    await expect(page.getByTestId('step-blockers')).toHaveText('Still needed: Your answer about the bar man method.');
    await page.getByTestId('bar-man-yes').check();
    await expect(page.getByTestId('next')).toBeEnabled();
    await expect(page.getByTestId('step-blockers')).toHaveCount(0);

    // A hotel is not asked, until it says it also runs a lounge.
    await pick(page, 'enterprise-type', 'Hotel');
    await expect(page.getByTestId('extra-type-Nightclub')).not.toBeChecked();
    await expect(page.getByTestId('bar-man-question')).toHaveCount(0);
    await page.getByTestId('extra-type-Lounge').check();
    await expect(page.getByTestId('bar-man-question')).toBeVisible();
  });

  test('an order goes from the attendant to the bar man and back, live, and stock leaves at dispatch', async ({ page, browser }, testInfo) => {
    const who = await barWithDemoData(page);
    const waiterCode = await addPinStaff(page, 'Wale Waiter', 'waiter', '7391');
    const barmanCode = await addPinStaff(page, 'Bola Barman', 'bartender', '8264');

    // The owner said Yes at registration: the setting is on and the menu has the Bar Orders screen.
    await page.goto('/app/settings/operations');
    await expect(page.getByTestId('bar-man-enabled')).toBeChecked();
    expect(await ginOnHand(page)).toContain('2,100');

    const barman = await newContext(browser);
    await pinSignIn(barman.page, who.slug, barmanCode, '8264');
    await expect(barman.page.getByTestId('bar-dock-button')).toBeVisible();
    await expect(barman.page.getByTestId('bar-dock-count')).toHaveCount(0);
    await barman.page.getByTestId('bar-dock-button').click();
    await expect(barman.page.getByTestId('bar-live')).toHaveAttribute('data-state', 'live');
    await expect(barman.page.getByTestId('bar-empty')).toBeVisible();
    await barman.page.getByTestId('bar-panel-close').click();

    const waiter = await newContext(browser);
    await pinSignIn(waiter.page, who.slug, waiterCode, '7391');
    await tableWith(waiter.page, '12', 'Demo Gin & Tonic', 'Demo Gin & Tonic');
    await waiter.page.getByTestId('send-order').click();
    await expect(waiter.page.getByTestId('bar-state-Demo Gin & Tonic').first()).toHaveText('waiting at the bar');

    // The bar man's device shows the prompt by itself: the table, who asked, and how much.
    const prompt = barman.page.getByTestId('bar-prompt-Table 12');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('from Wale Waiter');
    await expect(prompt).toContainText('2 items');
    await expect(barman.page.getByTestId('bar-dock-count')).toHaveText('1');

    // Tapping it expands the order.
    await prompt.getByTestId('bar-prompt-open').click();
    const card = barman.page.getByTestId('bar-panel').getByTestId('bar-order-Table 12');
    await expect(card.getByTestId('bar-from')).toHaveText('Wale Waiter');
    await expect(card.getByTestId('bar-items')).toContainText('1 x Demo Gin & Tonic');
    await card.getByTestId('bar-take').click();
    await expect(card.getByTestId('bar-status')).toHaveText('Preparing');
    await expect(barman.page.getByTestId('bar-dock-count')).toHaveCount(0);            // nothing is waiting to be taken any more

    // The attendant sees the bill follow along without touching anything, and nothing has left the shelf yet.
    await expect(waiter.page.getByTestId('bar-state-Demo Gin & Tonic').first()).toHaveText('being prepared');
    expect(await ginOnHand(page)).toContain('2,100');

    await card.getByTestId('bar-ready').click();
    await expect(barman.page.getByTestId('bar-empty')).toBeVisible();

    // The attendant is called with the table, on whatever screen they are.
    const ready = waiter.page.getByTestId('bar-prompt-mine-Table 12');
    await expect(ready).toContainText('Table 12 is ready');
    await expect(ready).toContainText('Collect from Bola Barman');
    await expect(waiter.page.getByTestId('bar-dock-count')).toHaveText('1');
    expect(await ginOnHand(page)).toContain('2,000');                                  // 2 x 50 ml, deducted at dispatch

    await ready.getByTestId('bar-prompt-acknowledge').click();
    await expect(ready).toHaveCount(0);
    await expect(waiter.page.getByTestId('bar-state-Demo Gin & Tonic').first()).toHaveText('served');

    // The Bar Orders screen keeps the history, and it reads well on a phone in dark mode.
    await barman.page.getByTestId('bar-panel-close').click();
    await barman.page.goto('/app/pos/bar-orders');
    const row = barman.page.getByTestId('bar-history-Table 12');
    await expect(row).toContainText('Collected');
    await expect(row).toContainText('Wale Waiter');
    await expect(row).toContainText('Bola Barman');
    await barman.page.setViewportSize({ width: 390, height: 844 });
    await barman.page.emulateMedia({ colorScheme: 'dark' });
    await expect(barman.page.getByTestId('bar-queue-empty')).toBeVisible();
    await barman.page.getByTestId('bar-dock-button').click();
    await expect(barman.page.getByTestId('bar-panel')).toBeVisible();
    const overflow = await barman.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const box = await barman.page.getByTestId('bar-panel').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await barman.page.screenshot({ path: testInfo.outputPath('bar-panel-phone-dark.png') });

    await barman.context.close();
    await waiter.context.close();
  });

  test('the bar man says what cannot be made and the attendant is told why', async ({ page, browser }) => {
    const who = await barWithDemoData(page);
    const waiterCode = await addPinStaff(page, 'Wale Waiter', 'waiter', '7391');
    const barmanCode = await addPinStaff(page, 'Bola Barman', 'bartender', '8264');

    const barman = await newContext(browser);
    await pinSignIn(barman.page, who.slug, barmanCode, '8264');
    await barman.page.goto('/app/pos/bar-orders');
    await expect(barman.page.getByTestId('bar-queue-empty')).toBeVisible();

    const waiter = await newContext(browser);
    await pinSignIn(waiter.page, who.slug, waiterCode, '7391');
    await tableWith(waiter.page, '9', 'Demo Gin & Tonic', 'Demo Canned Beans');
    await waiter.page.getByTestId('send-order').click();

    // The order appears in the queue on the Bar Orders screen by itself.
    const card = barman.page.getByTestId('bar-queue').getByTestId('bar-order-Table 9');
    await expect(card).toBeVisible();
    await card.getByTestId('bar-take').click();
    await card.getByTestId('bar-cant').click();
    await expect(card.getByTestId('bar-cant-confirm')).toBeDisabled();                 // a reason is required
    await card.getByRole('checkbox', { name: /Demo Canned Beans/ }).uncheck();          // only the cocktail cannot be made
    await card.getByTestId('bar-cant-reason-input').fill('Out of tonic');
    await card.getByTestId('bar-cant-confirm').click();
    await expect(card.getByTestId('bar-cant-reason')).toHaveText("Can't make: Out of tonic");

    // The attendant is told at once, with the reason, and the bill marks the line.
    const told = waiter.page.getByTestId('bar-prompt-mine-Table 9');
    await expect(told).toContainText("the bar can't make something");
    await expect(told).toContainText('Demo Gin & Tonic (Out of tonic)');
    await expect(waiter.page.getByTestId('bar-state-Demo Gin & Tonic')).toHaveText("bar can't make this");
    await told.getByTestId('bar-prompt-acknowledge').click();
    await expect(told).toHaveCount(0);

    // The rest is dispatched and collected as usual.
    await card.getByTestId('bar-ready').click();
    const ready = waiter.page.getByTestId('bar-prompt-mine-Table 9');
    await expect(ready).toContainText('Table 9 is ready');
    await ready.getByTestId('bar-prompt-acknowledge').click();
    await expect(waiter.page.getByTestId('bar-state-Demo Canned Beans')).toHaveText('served');
    await expect(waiter.page.getByTestId('bar-state-Demo Gin & Tonic')).toHaveText("bar can't make this");   // stays until it is voided

    await barman.context.close();
    await waiter.context.close();
  });

  test('without the method nothing changes, and people who are not bar men cannot open the bar', async ({ page, browser }) => {
    // This bar said No: no floating button, no menu entry, and Send deducts stock at once as before.
    const who = await barWithDemoData(page, false);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('user-name')).toBeVisible();
    await expect(page.getByTestId('bar-dock-button')).toHaveCount(0);
    expect(await posMenu(page)).not.toContain('Bar Orders');
    await tableWith(page, '3', 'Demo Gin & Tonic');
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('bill-lines')).toContainText('sent');
    await expect(page.getByTestId('bar-state-Demo Gin & Tonic')).toHaveCount(0);
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    expect(await ginOnHand(page)).toContain('2,050');
    await page.goto('/app/pos/bar-orders');
    await expect(page.getByTestId('bar-off')).toContainText('switched off');

    // The owner switches it on in Operations settings: the button and the menu entry appear on this device straight away.
    await page.goto('/app/settings/operations');
    await page.getByTestId('bar-man-enabled').check();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');
    await expect(page.getByTestId('bar-dock-button')).toBeVisible();
    expect((await posMenu(page)).slice(0, 3)).toEqual(['Point of Sale', 'Start / End of Day', 'Bar Orders']);

    // A waiter takes part as an attendant (they have the button) but cannot open the bar's own screen.
    const waiterCode = await addPinStaff(page, 'Wale Waiter', 'waiter', '7391');
    const waiter = await newContext(browser);
    await pinSignIn(waiter.page, who.slug, waiterCode, '7391');
    await expect(waiter.page.getByTestId('bar-dock-button')).toBeVisible();
    await waiter.page.getByTestId('bar-dock-button').click();
    await expect(waiter.page.getByTestId('bar-mine-empty')).toBeVisible();
    await expect(waiter.page.getByTestId('bar-open-screen')).toHaveCount(0);
    await waiter.page.goto('/app/pos/bar-orders');
    await expect(waiter.page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await expect(waiter.page.getByTestId('bar-orders-screen')).toHaveCount(0);
    await waiter.context.close();

    // A supermarket is never offered the setting.
    const market = await newContext(browser);
    await registerViaUi(market.page, { type: 'Supermarket' });
    await market.page.getByTestId('save-continue').click();
    await market.page.getByTestId('go-staff').click();
    await market.page.goto('/app/settings/operations');
    await expect(market.page.getByTestId('settings-save')).toBeVisible();
    await expect(market.page.getByTestId('bar-man-section')).toHaveCount(0);
    await market.context.close();
  });
});

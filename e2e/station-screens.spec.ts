import { Page, expect, test } from '@playwright/test';
import { choose, contrastOf, registerViaUi, openPos } from './helpers';

/**
 * Owner's decision of 2026-11-24: each preparation station picks the screen its tickets are worked on, Bar Orders or the Kitchen Display ("Shown on"
 * on Admin, Set-up, Stations). A ticket shows on its station's screen only, so a Kitchen ticket is no longer on both, and the floating panel, its
 * pop-ups, the bell and their sound are the Bar Orders side. A stock group made under a parent group that goes to the Kitchen follows its parent, and the
 * blank "Prepared at" choice says so. Everything here is walked through the real screens.
 */

/** A bar-type business that uses stations: it starts with a Bar (on Bar Orders), and a Kitchen is added the way an owner does it (Admin, Set-up, Stations). */
async function ownerWithKitchen(page: Page): Promise<void> {
  await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await page.goto('/app/settings/stations');
  await expect(page.getByTestId('station-screen-Bar')).toHaveText('Bar Orders');
  await page.getByTestId('station-new').click();
  await page.getByTestId('station-name').fill('Kitchen');
  await page.getByTestId('station-save').click();
  await expect(page.getByTestId('station-screen-Kitchen')).toHaveText('Kitchen Display');   // a station that holds nothing is a kitchen
}

async function newGroup(page: Page, name: string, opts: { parent?: string; station?: string } = {}): Promise<void> {
  await page.goto('/app/inventory/groups');
  await page.getByTestId('group-new').click();
  await page.getByTestId('group-name').fill(name);
  if (opts.parent) await choose(page, 'group-parent', opts.parent);
  if (opts.station) await choose(page, 'group-station', opts.station);
  await page.getByTestId('group-save').click();
  await expect(page.getByTestId(`group-${name}`)).toBeVisible();
}

async function newItem(page: Page, name: string, price: string, group?: string): Promise<void> {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  if (group) await choose(page, 'item-group', group);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

/** Food goes to the Kitchen; Burger is in it, Cola is in no group and so goes to the default station, the Bar. */
async function menu(page: Page): Promise<void> {
  await newGroup(page, 'Food', { station: 'Kitchen' });
  await newItem(page, 'Burger', '3000', 'Food');
  await newItem(page, 'Cola', '500');
}

async function sendBill(page: Page, label: string, items: string[]): Promise<void> {
  await openPos(page);
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  for (const item of items) await page.getByTestId(`product-${item}`).click();
  // The till adds a line on the device first and tells the server a moment later; a Send fired in that moment can be lost (findings FND-180 and FND-181: a person who presses Send again gets
  // it). Wait for the add to be told, as a person's pause does, so this spec is about the screens and not about that race.
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
  // The owner is a bar man too: a new-ticket prompt can float over Send, so it is pressed directly.
  await expect(page.getByTestId('send-order')).toBeEnabled();
  await page.getByTestId('send-order').dispatchEvent('click');
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

/** Opens Stations the way a person does, from the menu (no page load: the other screens must follow the change in the same session). */
async function stationsFromMenu(page: Page): Promise<void> {
  await page.locator('[data-nav="setup.admin"]').click();
  await page.locator('[data-testid="hub-list"] [data-nav="pos.stations"]').click();
  await expect(page.getByTestId('station-list')).toBeVisible();
}

async function setShownOn(page: Page, station: string, label: 'Bar Orders' | 'Kitchen Display'): Promise<void> {
  await page.getByTestId(`station-edit-${station}`).click();
  await page.getByTestId('station-screen').selectOption({ label });
  await page.getByTestId('station-save').click();
  await expect(page.getByTestId(`station-screen-${station}`)).toHaveText(label);
}

const bell = (page: Page) => page.getByTestId('bar-bell');

test.describe('Each station is shown on one screen', () => {
  test('a Kitchen ticket is on the Kitchen Display and not on Bar Orders, a Bar ticket is on Bar Orders and not on the Kitchen Display', async ({ page }) => {
    test.slow();
    await ownerWithKitchen(page);                                                              // the owner works at every station
    await menu(page);
    await sendBill(page, 'Both', ['Burger', 'Cola']);
    await expect(page.getByTestId('bar-state-Burger')).toHaveText('waiting at the kitchen');
    await expect(page.getByTestId('bar-state-Cola')).toHaveText('waiting at the bar');

    // The prompt and the bell are the Bar Orders side: they speak of the bar's ticket, not of the kitchen's.
    await expect(page.getByTestId('bar-prompt-title').filter({ hasText: 'New Bar order' })).toBeVisible();
    await expect(page.getByTestId('bar-prompt-title').filter({ hasText: 'New Kitchen order' })).toHaveCount(0);
    await expect(bell(page)).toHaveAttribute('data-count', '1');

    // Bar Orders: the drink, in the queue and in the last 24 hours; no burger.
    await page.goto('/app/pos/bar-orders');
    const queue = page.getByTestId('bar-queue');
    await expect(queue).toContainText('Cola');
    await expect(queue).not.toContainText('Burger');
    await expect(page.getByTestId('bar-history')).toContainText('Cola');
    await expect(page.getByTestId('bar-history')).not.toContainText('Burger');
    await expect(page.getByTestId('bar-no-station')).toHaveCount(0);

    // The Kitchen Display: the burger, in the ticket and in the all-day count; no drink; only the station shown here can be chosen.
    await page.goto('/app/pos/kitchen');
    const ticket = page.getByTestId('kitchen-ticket-Both');
    await expect(ticket).toHaveCount(1);
    await expect(ticket).toContainText('Burger');
    await expect(page.getByTestId('kitchen-tickets')).not.toContainText('Cola');
    await expect(page.getByTestId('allday-Burger')).toHaveText('1 x Burger');
    await expect(page.getByTestId('allday-Cola')).toHaveCount(0);
    await page.getByTestId('kds-station').click();
    await expect(page.getByTestId('kds-station-list')).toContainText('Kitchen');
    await expect(page.getByTestId('kds-station-list')).not.toContainText('Bar');
    await page.getByTestId('kds-station').press('Escape');

    // Each ticket is worked on its own screen, and the other screen is not told.
    await ticket.getByTestId('kitchen-take').click();
    await ticket.getByTestId('kitchen-bump').click();
    await expect(page.getByTestId('kitchen-recent-Both')).toContainText('Burger');
    await page.goto('/app/pos/bar-orders');
    await queue.getByTestId('bar-take').click();
    await queue.getByTestId('bar-ready').click();
    await expect(page.getByTestId('bar-queue-empty')).toBeVisible();
    await expect(page.getByTestId('bar-history')).toContainText('Cola');
    await expect(page.getByTestId('bar-history')).not.toContainText('Burger');
  });

  test('changing where a station is shown moves its tickets, and the prompts and the bell follow', async ({ page }) => {
    test.slow();
    await ownerWithKitchen(page);
    await menu(page);
    await sendBill(page, 'Solo', ['Burger']);
    await expect(page.getByTestId('bar-state-Burger')).toHaveText('waiting at the kitchen');

    // Shown on the Kitchen Display: it is there, and nothing at the bar side rings or counts.
    await page.getByTestId('main-nav').locator('[data-nav="pos.kitchen"]').click();
    await expect(page.getByTestId('kitchen-ticket-Solo')).toBeVisible();
    await expect(bell(page)).toHaveAttribute('data-count', '0');
    await expect(page.getByTestId('bar-prompt-title')).toHaveCount(0);

    // The owner moves the Kitchen to Bar Orders: the ticket is on Bar Orders now, with a prompt that names the kitchen, and the bell counts it.
    await stationsFromMenu(page);
    await setShownOn(page, 'Kitchen', 'Bar Orders');
    await page.getByTestId('main-nav').locator('[data-nav="pos.bar"]').click();
    await expect(page.getByTestId('bar-queue')).toContainText('Burger');
    await expect(page.getByTestId('bar-prompt-title').filter({ hasText: 'New Kitchen order' })).toBeVisible();
    await expect(bell(page)).toHaveAttribute('data-count', '1');

    // The Kitchen Display no longer has it, and says that no station is shown there.
    await page.getByTestId('main-nav').locator('[data-nav="pos.kitchen"]').click();
    await expect(page.getByTestId('kitchen-no-station')).toBeVisible();
    await expect(page.getByTestId('kitchen-ticket-Solo')).toHaveCount(0);

    // And back: the ticket returns to the Kitchen Display and the bar side is quiet again.
    await stationsFromMenu(page);
    await setShownOn(page, 'Kitchen', 'Kitchen Display');
    await page.getByTestId('main-nav').locator('[data-nav="pos.bar"]').click();
    await expect(page.getByTestId('bar-queue-empty')).toBeVisible();
    await expect(bell(page)).toHaveAttribute('data-count', '0');
    await page.getByTestId('main-nav').locator('[data-nav="pos.kitchen"]').click();
    await expect(page.getByTestId('kitchen-ticket-Solo')).toBeVisible();
    await expect(page.getByTestId('kitchen-no-station')).toHaveCount(0);
  });

  test('the sound follows the screen: a Kitchen ticket sounds on the Kitchen Display only, a Bar ticket on the Bar Orders side only', async ({ page }) => {
    test.slow();
    // The sound is two notes made with the browser's AudioContext: every one made on a page is counted, so "no sound" can be asserted.
    await page.context().addInitScript(() => {
      const w = window as unknown as { AudioContext: typeof AudioContext; __chimes: number };
      w.__chimes = 0;
      const Original = w.AudioContext;
      w.AudioContext = class extends Original { constructor(...args: ConstructorParameters<typeof AudioContext>) { super(...args); w.__chimes++; } } as typeof AudioContext;
    });
    const chimes = (p: Page): Promise<number> => p.evaluate(() => (window as unknown as { __chimes?: number }).__chimes ?? 0);

    await ownerWithKitchen(page);
    await menu(page);
    await page.goto('/app/pos/kitchen');                                                      // a kitchen screen that stays open
    await expect(page.getByTestId('kitchen-empty')).toBeVisible();
    expect(await chimes(page)).toBe(0);                                                       // opening it, and finding it empty, is silent

    const till = await page.context().newPage();
    await sendBill(till, 'Solo', ['Burger']);
    await expect(page.getByTestId('kitchen-ticket-Solo')).toBeVisible();                       // it arrived on the Kitchen Display by itself
    await expect.poll(() => chimes(page), { message: 'the Kitchen Display sounds for its own new ticket' }).toBe(1);

    await sendBill(till, 'Drink', ['Cola']);
    await expect(till.getByTestId('bar-prompt-title').filter({ hasText: 'New Bar order' })).toBeVisible();
    await expect.poll(() => chimes(till), { message: 'the Bar Orders side sounds once, for the drink, and not for the burger' }).toBe(1);
    await expect(page.getByTestId('kitchen-ticket-Drink')).toHaveCount(0);
    // The floating panel is on every screen, the Kitchen Display's too: the drink sounds there once more, through the panel (the burger did not).
    await expect.poll(() => chimes(page), { message: 'the bar ticket sounds through the floating panel, wherever the person is' }).toBe(2);
    await till.close();
  });

  test('the Stations form shows the choice, offers the one the behaviour suggests, and keeps what is saved', async ({ page }) => {
    test.slow();
    await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    await page.goto('/app/settings/stations');

    // The list says where each station is shown; the bar is on Bar Orders.
    await expect(page.getByTestId('station-screen-Bar')).toHaveText('Bar Orders');
    await page.getByTestId('station-new').click();
    const screen = page.getByTestId('station-screen');
    await expect(screen).toHaveValue('KitchenDisplay');
    await expect(page.getByTestId('station-screen-help')).toContainText('Bar Orders');
    await expect(page.getByTestId('station-screen-help')).toContainText('Kitchen Display');

    // A new station is offered what the switches suggest (a bar holds payment or takes stock when ready) until the person picks one.
    await page.getByTestId('station-holds').check();
    await expect(screen).toHaveValue('BarOrders');
    await page.getByTestId('station-holds').uncheck();
    await expect(screen).toHaveValue('KitchenDisplay');
    await page.getByTestId('station-stock').check();
    await expect(screen).toHaveValue('BarOrders');
    await screen.selectOption({ label: 'Kitchen Display' });
    await page.getByTestId('station-holds').check();
    await expect(screen).toHaveValue('KitchenDisplay');                                        // chosen by hand: the switches no longer move it
    await page.getByTestId('station-name').fill('Pastry');
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-screen-Pastry')).toHaveText('Kitchen Display');

    // Opening it again shows what was saved; the switches of an existing station never move the screen; the change is saved and kept.
    await page.getByTestId('station-edit-Pastry').click();
    await expect(screen).toHaveValue('KitchenDisplay');
    await page.getByTestId('station-holds').uncheck();
    await expect(screen).toHaveValue('KitchenDisplay');
    await page.getByTestId('station-holds').check();
    await screen.selectOption({ label: 'Bar Orders' });
    await page.getByTestId('station-save').click();
    await expect(page.getByTestId('station-screen-Pastry')).toHaveText('Bar Orders');
    await page.reload();
    await expect(page.getByTestId('station-screen-Pastry')).toHaveText('Bar Orders');
    await expect(page.getByTestId('station-screen-Bar')).toHaveText('Bar Orders');
    await page.getByTestId('station-edit-Pastry').click();
    await expect(page.getByTestId('station-screen')).toHaveValue('BarOrders');
  });

  test('the blank "Prepared at" choice names the parent group\'s station, in the group window, on Stock Groups and on the stock card', async ({ page }) => {
    test.slow();
    await ownerWithKitchen(page);
    await newGroup(page, 'Food', { station: 'Kitchen' });
    await newGroup(page, 'Drinks');

    // Stock Groups: with no parent the old words; under Food the blank choice says the Kitchen; under Drinks (which names none) the old words again.
    await page.getByTestId('group-new').click();
    await expect(page.getByTestId('group-station')).toHaveValue('The default station (Bar)');
    await choose(page, 'group-parent', 'Food');
    await expect(page.getByTestId('group-station')).toHaveValue('As the parent group says (Kitchen)');
    await choose(page, 'group-parent', 'Drinks');
    await expect(page.getByTestId('group-station')).toHaveValue('The default station (Bar)');
    await choose(page, 'group-parent', 'Food');
    await page.getByTestId('group-name').fill('Pasta dishes');
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Pasta dishes')).toBeVisible();

    // It was kept: the group still says its parent's station, and so does one under that group (the nearest group above that names one).
    await page.getByTestId('group-edit-Pasta dishes').click();
    await expect(page.getByTestId('group-station')).toHaveValue('As the parent group says (Kitchen)');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('group-new').click();
    await choose(page, 'group-parent', 'Pasta dishes');
    await expect(page.getByTestId('group-station')).toHaveValue('As the parent group says (Kitchen)');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // The window over the item form says the same, following the parent as it is chosen.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-group-new').click();
    await expect(page.getByTestId('ng-station')).toHaveValue('The default station (Bar)');
    await choose(page, 'ng-parent', 'Food');
    await expect(page.getByTestId('ng-station')).toHaveValue('As the parent group says (Kitchen)');
    await choose(page, 'ng-parent', 'Drinks');
    await expect(page.getByTestId('ng-station')).toHaveValue('The default station (Bar)');
    await page.getByTestId('ng-cancel').click();

    // The stock card names the station its blank choice comes to: the group's, its parent's, or the default.
    await page.getByTestId('item-name').fill('Penne');
    await expect(page.getByTestId('item-station')).toHaveValue('As the stock group says (Bar)');
    await choose(page, 'item-group', 'Pasta dishes');
    await expect(page.getByTestId('item-station')).toHaveValue('As the stock group says (Kitchen)');
    await choose(page, 'item-group', 'Drinks');
    await expect(page.getByTestId('item-station')).toHaveValue('As the stock group says (Bar)');
    await choose(page, 'item-group', 'Food');
    await expect(page.getByTestId('item-station')).toHaveValue('As the stock group says (Kitchen)');
    await choose(page, 'item-station', 'Bar');                                                  // the item's own station wins over the group's
    await expect(page.getByTestId('item-station')).toHaveValue('Bar');
  });
});

test.describe('The new parts in both themes and on a phone', () => {
  /** The words of the new choice, its help and the badges, and of the card a screen with no station shows. */
  async function expectReadable(page: Page, theme: string, shown: Record<string, string>): Promise<void> {
    for (const [what, selector] of Object.entries(shown)) {
      expect(await contrastOf(page, selector), `${what} in the ${theme} theme`).toBeGreaterThanOrEqual(4.5);
    }
  }

  test('dark theme: a screen with no station says where to change it, and every new part is readable', async ({ page }) => {
    test.slow();
    await registerViaUi(page, { type: 'Nightclub', barManMethod: true });                       // a dark theme; only the Bar exists, and it is on Bar Orders
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    expect(Number(canvas.split(/\s+/)[0]), `the theme under test is dark (canvas ${canvas})`).toBeLessThan(80);

    // No station is shown on the Kitchen Display: the screen says so, where to change it, and the link goes there.
    await page.goto('/app/pos/kitchen');
    const card = page.getByTestId('kitchen-no-station');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Admin, Set-up, Stations');
    await expect(card).toContainText('Shown on');
    await expect(page.getByTestId('kitchen-empty')).toHaveCount(0);
    await expectReadable(page, 'dark', {
      'the heading of the empty card': '[data-testid="kitchen-no-station"] h2',
      'the words of the empty card': '[data-testid="kitchen-no-station"] p',
      'the link of the empty card': '[data-testid="kitchen-open-stations"]'
    });
    await page.getByTestId('kitchen-open-stations').click();
    await expect(page).toHaveURL(/\/app\/settings\/stations$/);

    // The form and the badge.
    await expectReadable(page, 'dark', { 'the badge of the Bar': '[data-testid="station-screen-Bar"]' });
    await page.getByTestId('station-new').click();
    await expectReadable(page, 'dark', { 'the choice': '[data-testid="station-screen"]', 'its help': '[data-testid="station-screen-help"]' });
    await page.getByTestId('station-form').getByRole('button', { name: 'Cancel' }).click();

    // The Bar moved to the Kitchen Display: now Bar Orders is the screen with no station, and the Kitchen Display lists the Bar.
    await setShownOn(page, 'Bar', 'Kitchen Display');
    await expectReadable(page, 'dark', { 'the badge of the Kitchen Display': '[data-testid="station-screen-Bar"]' });
    await page.goto('/app/pos/bar-orders');
    await expect(page.getByTestId('bar-no-station')).toBeVisible();
    await expect(page.getByTestId('bar-no-station')).toContainText('Admin, Set-up, Stations');
    await expect(page.getByTestId('bar-queue-empty')).toHaveCount(0);
    await expectReadable(page, 'dark', {
      'the heading of the empty card': '[data-testid="bar-no-station"] h2',
      'the words of the empty card': '[data-testid="bar-no-station"] p',
      'the link of the empty card': '[data-testid="bar-open-stations"]'
    });
    await page.goto('/app/pos/kitchen');
    await expect(page.getByTestId('kitchen-no-station')).toHaveCount(0);
    await expect(page.getByTestId('kitchen-empty')).toBeVisible();
    await page.getByTestId('kds-station').click();
    await expect(page.getByTestId('kds-station-list')).toContainText('Bar');
  });

  test('light theme and a phone: the Stations form and the screens with no station fit 390 px and are readable', async ({ page }) => {
    test.slow();
    await registerViaUi(page, { type: 'Restaurant' });                                          // a light theme; the stations are switched on in Settings
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    expect(Number(canvas.split(/\s+/)[0]), `the theme under test is light (canvas ${canvas})`).toBeGreaterThan(180);
    await page.goto('/app/settings/operations');
    await page.getByTestId('bar-man-enabled').check();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');

    // A restaurant's first station is a Kitchen, shown on the Kitchen Display: Bar Orders then has no station and says so.
    await page.goto('/app/settings/stations');
    await expect(page.getByTestId('station-screen-Kitchen')).toHaveText('Kitchen Display');
    await expectReadable(page, 'light', { 'the badge of the Kitchen Display': '[data-testid="station-screen-Kitchen"]' });
    await page.getByTestId('station-new').click();
    await expectReadable(page, 'light', { 'the choice': '[data-testid="station-screen"]', 'its help': '[data-testid="station-screen-help"]' });
    await page.getByTestId('station-form').getByRole('button', { name: 'Cancel' }).click();
    await page.goto('/app/pos/bar-orders');
    await expect(page.getByTestId('bar-no-station')).toBeVisible();
    await expectReadable(page, 'light', {
      'the heading of the empty card': '[data-testid="bar-no-station"] h2',
      'the words of the empty card': '[data-testid="bar-no-station"] p',
      'the link of the empty card': '[data-testid="bar-open-stations"]'
    });

    // On a phone: the page never scrolls sideways, and the form's choice and its help are inside the screen.
    await page.setViewportSize({ width: 390, height: 844 });
    const sideways = (): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(await sideways(), 'Bar Orders with no station at 390 px').toBe(false);
    await page.goto('/app/pos/kitchen');
    await expect(page.getByTestId('kitchen-tickets')).toBeVisible();
    expect(await sideways(), 'the Kitchen Display at 390 px').toBe(false);
    await page.goto('/app/settings/stations');
    await expect(page.getByTestId('station-screen-Kitchen')).toBeVisible();
    expect(await sideways(), 'the Stations list at 390 px').toBe(false);
    await page.getByTestId('station-new').click();
    for (const id of ['station-screen', 'station-screen-help']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.x, `${id} starts inside the screen`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${id} ends inside the screen`).toBeLessThanOrEqual(390.5);
    }
    expect(await sideways(), 'the Stations form at 390 px').toBe(false);
    await page.getByTestId('station-screen').selectOption({ label: 'Bar Orders' });
    await expect(page.getByTestId('station-screen')).toHaveValue('BarOrders');
  });
});

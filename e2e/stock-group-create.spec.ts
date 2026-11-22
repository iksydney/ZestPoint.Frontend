import { Page, expect, test } from '@playwright/test';
import { Registered, choose, newContext, registerViaUi, signInViaUi } from './helpers';

/**
 * Owner's request of 2026-11-22: a person adding a stock item who finds no fitting stock group makes one from the item form, in a window
 * that floats over it, and the new group is chosen for the item at once. The group box is searchable, and a name that is the same as, or
 * looks the same as, a group that exists is never sent: the person is shown that group and may use it. (The name rule itself is checked
 * as pure functions in `stock-group-names.spec.ts`; the server applies the same rule and is the authority.)
 */

async function ownerInApp(page: Page, type = 'Bar'): Promise<Registered> {
  const who = await registerViaUi(page, { type });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function openNewItem(page: Page): Promise<void> {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await expect(page.getByTestId('stock-card')).toBeVisible();
}

/** Makes a group through the link under the box, the way a person does, and waits for the window to go. */
async function makeGroup(page: Page, name: string, parent?: string): Promise<void> {
  await page.getByTestId('item-group-new').click();
  await page.getByTestId('ng-name').fill(name);
  if (parent) await choose(page, 'ng-parent', parent);
  await page.getByTestId('ng-save').click();
  await expect(page.getByTestId('ng-form')).toHaveCount(0);
  await expect(page.getByTestId('item-group')).toHaveValue(name);
}

async function addPinStaff(page: Page, name: string, roleKey: string, pin = '7391'): Promise<string> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  await page.getByTestId('create-staff').click();
  const code = (await page.getByTestId('staff-added-code').innerText()).trim();
  await page.getByTestId('staff-added-done').click();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
  return code;
}

/** WCAG contrast of the words in an element against the colours really behind them (every layer blended). */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Nothing matches ${sel}`);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const rgba = (c: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const layers: [number, number, number, number][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    let bg: [number, number, number] = [255, 255, 255];
    for (const l of layers.reverse()) bg = [0, 1, 2].map((i) => l[i]! * l[3] + bg[i]! * (1 - l[3])) as [number, number, number];
    const fg = rgba(getComputedStyle(el).color);
    const text = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]));
    const lum = (c: number[]): number => { const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
    const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

test.describe('A new stock group from the item form', () => {
  test('a group that is not there is made over the item form, chosen at once, and the person can still change it', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await openNewItem(page);
    await page.getByTestId('item-name').fill('Cola');
    const group = page.getByTestId('item-group');
    const list = page.getByTestId('item-group-list');
    await expect(group).toHaveValue('No group');

    // With no group made yet the list holds "No group" and, last, the way to make one.
    await group.click();
    await expect(list.locator('[data-value]')).toHaveCount(1);
    await expect(list.locator('[role="option"]').last()).toHaveText('+ Create a new stock group...');
    await group.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(page.getByTestId('stock-card')).toBeVisible();                           // Escape closed the list only

    // The link under the box opens the window over the card; the cursor is in the name; an empty name is not sent.
    await page.getByTestId('item-group-new').click();
    await expect(page.getByTestId('ng-form')).toBeVisible();
    await expect(page.getByTestId('stock-card')).toBeVisible();
    await expect(page.getByTestId('ng-name')).toBeFocused();
    await expect(page.getByTestId('ng-station')).toHaveValue(/Nowhere|default station/);
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-name-error')).toHaveText('Type a name.');
    await page.getByTestId('ng-name').fill('--');
    await expect(page.getByTestId('ng-name-error')).toHaveText('Type a name with at least one letter or number.');
    await page.getByTestId('ng-name').fill('Soft Drinks');
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-form')).toHaveCount(0);
    await expect(group).toHaveValue('Soft Drinks');                                        // chosen for the item without another click
    await expect(page.getByText("Group 'Soft Drinks' created and chosen.")).toBeVisible();

    // The last entry of the box does the same, and what was typed becomes the first name; a parent group can be named.
    await group.click();
    await expect(page.getByTestId('item-group-create')).toBeVisible();
    await page.getByTestId('item-group-create').click();
    await expect(page.getByTestId('ng-form')).toBeVisible();
    await expect(page.getByTestId('ng-name')).toHaveValue('');
    await page.getByTestId('ng-name').fill('Spirits');
    await page.getByTestId('ng-save').click();
    await expect(group).toHaveValue('Spirits');
    await makeGroup(page, 'Mixers', 'Soft');
    await expect(group).toHaveValue('Mixers');

    // "Except they change it": any other group can be picked afterwards, and the choice is saved with the item.
    await choose(page, 'item-group', 'Spirits');
    await expect(group).toHaveValue('Spirits');
    await choose(page, 'item-group', 'Mixers');
    await page.getByTestId('item-price').fill('500');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Cola')).toBeVisible();
    await page.getByTestId('item-edit-Cola').click();
    await expect(page.getByTestId('item-group')).toHaveValue('Mixers');

    // The group exists on Stock Group Maintenance with the parent that was chosen in the window.
    await page.goto('/app/inventory/groups');
    await expect(page.getByTestId('group-Mixers')).toContainText('Soft Drinks');
    await expect(page.getByTestId('group-Spirits')).toBeVisible();
  });

  test('the group box can be searched by group or parent name, keys work, Escape closes only what is open, and cancelling changes nothing', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await openNewItem(page);
    await makeGroup(page, 'Soft Drinks');
    await makeGroup(page, 'Spirits');
    await makeGroup(page, 'Mixers', 'Soft');
    await choose(page, 'item-group', 'No group');
    const group = page.getByTestId('item-group');
    const list = page.getByTestId('item-group-list');
    await expect(group).toHaveValue('No group');

    // All of them are listed (no scrolling to find one); typing narrows by the group's name or its parent's.
    await group.click();
    await expect(list.locator('[data-value]')).toHaveCount(4);
    await group.fill('spir');
    await expect(list.locator('[data-value]')).toHaveCount(1);
    await expect(list.locator('[data-value]')).toContainText('Spirits');
    await group.fill('soft');
    await expect(list.locator('[data-value]')).toHaveCount(2);                              // Soft Drinks, and Mixers, which is in it
    await expect(list.locator('[data-value]').first()).toContainText('Soft Drinks');        // the name that starts with the words comes first
    await expect(list.locator('[data-value]').last()).toContainText('in Soft Drinks');

    // Nothing found: a plain line, and the way to make it.
    await group.fill('Wines');
    await expect(page.getByTestId('item-group-none')).toHaveText("No group called 'Wines'.");
    await expect(page.getByTestId('item-group-create')).toBeVisible();
    await group.press('Enter');                                                              // the make-one entry is the one under the cursor
    await expect(page.getByTestId('ng-form')).toBeVisible();
    await expect(page.getByTestId('ng-name')).toHaveValue('Wines');

    // Escape in the window closes the window alone: the card is still there, nothing was made, the box is as it was, focus is back in it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ng-form')).toHaveCount(0);
    await expect(page.getByTestId('stock-card')).toBeVisible();
    await expect(group).toHaveValue('No group');
    await expect(group).toBeFocused();
    await expect(list).toHaveCount(0);

    // Cancel does the same, and focus goes back to the link that opened the window.
    await page.getByTestId('item-group-new').click();
    await page.getByTestId('ng-name').fill('Never made');
    await page.getByTestId('ng-cancel').click();
    await expect(page.getByTestId('ng-form')).toHaveCount(0);
    await expect(page.getByTestId('item-group-new')).toBeFocused();
    await expect(group).toHaveValue('No group');
    await group.click();
    await expect(list.locator('[data-value]')).toHaveCount(4);                               // nothing new in the list

    // Keys: Down walks, Enter chooses; past the last group the next stop is the make-one entry.
    await group.press('Escape');
    await group.press('ArrowDown');
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    const second = (await list.locator('[data-value]').nth(1).locator('.font-medium').innerText()).trim();   // the row after "No group"
    await group.press('ArrowDown');
    await group.press('Enter');
    await expect(list).toHaveCount(0);
    await expect(group).toHaveValue(second);
    for (let i = 0; i < 8; i++) await group.press('ArrowDown');
    await expect(page.getByTestId('item-group-create')).toHaveAttribute('data-active', 'true');
    await group.press('Enter');
    await expect(page.getByTestId('ng-form')).toBeVisible();
    await page.getByTestId('ng-cancel').click();
    await expect(group).toHaveValue(second);                                                 // cancelled: what was chosen before stays
  });

  test('a name that is the same or looks the same as a group is not sent: the group is shown and can be used, a switched-off one is explained', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await openNewItem(page);
    await makeGroup(page, 'Soft Drinks');
    await makeGroup(page, 'Old Stock');
    await page.getByTestId('stock-card-close').click();
    await page.goto('/app/inventory/groups');
    await page.getByTestId('group-edit-Old Stock').click();
    await page.getByLabel('Active', { exact: true }).uncheck();
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Old Stock')).toHaveCount(0);                         // switched off: hidden until "Show inactive"

    const posts: string[] = [];
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/inventory/groups')) posts.push(r.url()); });
    await openNewItem(page);
    const group = page.getByTestId('item-group');
    await page.getByTestId('item-group-new').click();
    const name = page.getByTestId('ng-name');
    const clash = page.getByTestId('ng-clash');
    await expect(clash).toHaveCount(0);

    await name.fill('SOFT DRINKS');
    await expect(clash).toContainText("A stock group called 'Soft Drinks' already exists.");
    await name.fill('soft drink');
    await expect(clash).toContainText("'soft drink' looks the same as the existing group 'Soft Drinks'.");
    await expect(page.getByTestId('ng-use-existing')).toHaveText("Use 'Soft Drinks'");
    await name.fill('Soft-Drinks');
    await expect(clash).toContainText("'Soft-Drinks' looks the same as the existing group 'Soft Drinks'.");

    // Create is pressed anyway: nothing is sent and the window stays.
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-form')).toBeVisible();
    await expect(clash).toBeVisible();
    expect(posts).toHaveLength(0);

    // A group that is switched off: said so, no Use button, and where to switch it on.
    await name.fill('old-stock');
    await expect(clash).toContainText("'old-stock' looks the same as the group 'Old Stock', which exists but is switched off.");
    await expect(clash).toContainText('Stock Group Maintenance');
    await expect(page.getByTestId('ng-use-existing')).toHaveCount(0);
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-form')).toBeVisible();
    expect(posts).toHaveLength(0);

    // Use the group that exists: the window goes, the item has that group, nothing was made.
    await name.fill('softdrinks');
    await page.getByTestId('ng-use-existing').click();
    await expect(page.getByTestId('ng-form')).toHaveCount(0);
    await expect(group).toHaveValue('Soft Drinks');
    expect(posts).toHaveLength(0);

    // A clearly different name goes through (the same rule lets 'Beer' and 'Beef' live side by side).
    await page.getByTestId('item-group-new').click();
    await name.fill('Beef');
    await expect(clash).toHaveCount(0);
    await page.getByTestId('ng-save').click();
    await expect(group).toHaveValue('Beef');
    expect(posts).toHaveLength(1);
    await page.getByTestId('item-group-new').click();
    await name.fill('Beer');
    await expect(clash).toHaveCount(0);                                                       // one letter apart but short: two different words
    await page.getByTestId('ng-save').click();
    await expect(group).toHaveValue('Beer');
    expect(posts).toHaveLength(2);
  });

  test('Stock Group Maintenance refuses the same or a similar name in the server\'s own words, and a group saved under its own name is never refused', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.goto('/app/inventory/groups');
    const make = async (name: string): Promise<void> => {
      await page.getByTestId('group-new').click();
      await page.getByTestId('group-name').fill(name);
      await page.getByTestId('group-save').click();
    };
    await make('Soft Drinks');
    await expect(page.getByTestId('group-Soft Drinks')).toBeVisible();

    await make('soft-drink');
    await expect(page.getByRole('alert').filter({ hasText: 'looks the same as the existing stock group "Soft Drinks"' })).toBeVisible();
    await page.getByTestId('group-name').fill('SOFT DRINKS');
    await page.getByTestId('group-save').click();
    await expect(page.getByRole('alert').filter({ hasText: 'A stock group called "Soft Drinks" already exists' })).toBeVisible();
    await page.getByTestId('group-name').fill('--');
    await page.getByTestId('group-save').click();
    await expect(page.getByRole('alert').filter({ hasText: 'at least one letter or number' })).toBeVisible();
    await page.getByTestId('group-name').fill('Beef');                                         // a clearly different name goes through
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Beef')).toBeVisible();

    // Editing a group and keeping its name is not a clash with itself.
    await page.getByTestId('group-edit-Soft Drinks').click();
    await page.locator('#g-desc').fill('Fizzy and still');
    await page.getByTestId('group-save').click();
    await expect(page.getByTestId('group-Soft Drinks')).toContainText('Fizzy and still');
  });

  test('a person who may not manage stock groups can pick one but is not offered the way to make one', async ({ page, browser }) => {
    test.slow();
    const who = await ownerInApp(page);
    await openNewItem(page);
    await makeGroup(page, 'Spirits');
    await page.getByTestId('stock-card-close').click();
    const code = await addPinStaff(page, 'Bea Manager', 'branch-manager');       // may add items, may not manage groups

    const manager = await newContext(browser);
    await manager.page.goto('/login');
    await manager.page.getByTestId('login-slug').fill(who.slug);
    await manager.page.getByTestId('mode-pin').click();
    await manager.page.getByTestId('login-code').fill(code);
    await manager.page.getByTestId('login-pin').fill('7391');
    await manager.page.getByTestId('login-submit').click();
    await expect(manager.page).toHaveURL(/\/app\/(dashboard|pos)/);
    await openNewItem(manager.page);
    const group = manager.page.getByTestId('item-group');
    await group.click();
    await expect(manager.page.getByTestId('item-group-list').locator('[data-value]')).toHaveCount(2);   // No group, Spirits
    await expect(manager.page.getByTestId('item-group-create')).toHaveCount(0);
    await expect(manager.page.getByTestId('item-group-new')).toHaveCount(0);
    await choose(manager.page, 'item-group', 'Spirits');
    await expect(group).toHaveValue('Spirits');
    await manager.context.close();
  });

  test('a refusal from the server is shown in the window in its own words, and nothing is chosen', async ({ page, browser }) => {
    test.slow();
    const who = await ownerInApp(page);
    await openNewItem(page);                                                                  // the groups are read now: there are none

    // Someone else makes "Mixers" meanwhile, so this form does not know it.
    const other = await newContext(browser);
    await signInViaUi(other.page, who);
    await expect(other.page).toHaveURL(/\/app\//);
    await other.page.goto('/app/inventory/groups');
    await other.page.getByTestId('group-new').click();
    await other.page.getByTestId('group-name').fill('Mixers');
    await other.page.getByTestId('group-save').click();
    await expect(other.page.getByTestId('group-Mixers')).toBeVisible();
    await other.context.close();

    await page.getByTestId('item-group-new').click();
    await page.getByTestId('ng-name').fill('Mixers');
    await expect(page.getByTestId('ng-clash')).toHaveCount(0);                                // this form could not know
    await page.getByTestId('ng-save').click();
    await expect(page.getByTestId('ng-error')).toContainText(/exist/i);
    await expect(page.getByTestId('ng-form')).toBeVisible();
    await expect(page.getByTestId('item-group')).toHaveValue('No group');
  });
});

test.describe('The group box and window in both themes and on a phone', () => {
  /** Drinks, and Soft Drinks inside it, then the list open with the cursor on the second row. */
  async function listWithGroups(page: Page): Promise<void> {
    await openNewItem(page);
    await makeGroup(page, 'Drinks');
    await makeGroup(page, 'Soft Drinks', 'Drinks');
    await choose(page, 'item-group', 'No group');
    await page.getByTestId('item-group').click();
    await page.getByTestId('item-group').press('ArrowDown');
    await expect(page.getByTestId('item-group-list').locator('[data-value]')).toHaveCount(3);
  }

  async function expectReadable(page: Page, theme: string): Promise<void> {
    const entry = '[data-testid="item-group-list"] li[data-value]';
    for (const [what, selector] of [
      ['a group name', `${entry}[data-active="false"] .font-medium`],
      ['the parent line under a group', `${entry}[data-active="false"] .block`],
      ['the entry under the cursor', `${entry}[data-active="true"] .font-medium`],
      ['the make-one entry', '[data-testid="item-group-create"]'],
      ['the link under the box', '[data-testid="item-group-new"]'],
      ['the text in the box', '[data-testid="item-group"]']
    ] as const) {
      expect(await contrastOf(page, selector), `${what} in the ${theme} theme`).toBeGreaterThanOrEqual(4.5);
    }
    await page.getByTestId('item-group').fill('zzz');
    expect(await contrastOf(page, '[data-testid="item-group-none"]'), `the nothing-found line in the ${theme} theme`).toBeGreaterThanOrEqual(4.5);
  }

  test('in a dark theme every part is readable', async ({ page }) => {
    test.slow();
    await ownerInApp(page, 'Nightclub');                                                      // its theme preset has a dark background
    await listWithGroups(page);
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    expect(Number(canvas.split(/\s+/)[0]), `the theme under test is dark (canvas ${canvas})`).toBeLessThan(80);
    await expectReadable(page, 'dark');
  });

  test('in a light theme every part is readable, and on a phone the list and the window fit the screen with no sideways scrolling', async ({ page }) => {
    test.slow();
    await ownerInApp(page, 'Restaurant');                                                     // its theme preset is light
    await listWithGroups(page);
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    expect(Number(canvas.split(/\s+/)[0]), `the theme under test is light (canvas ${canvas})`).toBeGreaterThan(180);
    await expectReadable(page, 'light');

    await page.setViewportSize({ width: 360, height: 640 });
    // The card itself fits the phone: its price table scrolls inside it, the card does not grow past the screen.
    const fits = await page.getByTestId('stock-card').evaluate((card) => ({ card: Math.round(card.getBoundingClientRect().width), overlay: card.parentElement!.clientWidth, scroll: card.parentElement!.scrollWidth }));
    expect(fits.card, 'the stock card is no wider than the phone').toBeLessThanOrEqual(360);
    expect(fits.scroll, 'the overlay of the stock card does not scroll sideways').toBeLessThanOrEqual(fits.overlay);
    await page.getByTestId('item-group').fill('');
    await page.getByTestId('item-group').click();
    const box = await page.getByTestId('item-group-list').boundingBox();
    expect(box, 'the list is drawn').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(box!.y + box!.height).toBeLessThanOrEqual(640);
    await page.getByTestId('item-group').press('Escape');

    await page.getByTestId('item-group-new').click();
    await expect(page.getByTestId('ng-form')).toBeVisible();
    for (const id of ['ng-name', 'ng-parent', 'ng-station', 'ng-save', 'ng-cancel']) {
      const b = await page.getByTestId(id).boundingBox();
      expect(b, id).not.toBeNull();
      expect(b!.x, id).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width, id).toBeLessThanOrEqual(360);
    }
    await page.getByTestId('ng-parent').click();                                              // the list of parents opens inside the screen too
    const parents = await page.getByTestId('ng-parent-list').boundingBox();
    expect(parents!.x + parents!.width).toBeLessThanOrEqual(360);
    expect(parents!.y + parents!.height).toBeLessThanOrEqual(640);
    await page.getByTestId('ng-parent').press('Escape');
    await expect(page.getByTestId('ng-form')).toBeVisible();                                   // Escape closed the list, not the window
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the page does not scroll sideways').toBe(true);
  });
});

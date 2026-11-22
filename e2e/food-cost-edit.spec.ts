import { Page, expect, test } from '@playwright/test';
import { Registered, newContext, registerViaUi } from './helpers';

/**
 * Food cost: single edits (owner's decisions, 2026-11-22). A person who may set prices can type a price for a dish, give one dish a food cost target of its own, and edit several dishes
 * then save once. The dish's food cost % and its price for the target follow the typing at once (worked out in the page); saving asks first, and a dish the server cannot save is named
 * with its reason while the others are saved and what was typed for the failed one stays in the table.
 */

const RICE = 'Jollof rice';       // price 100, cost 20: 20.0% of its price, 66.67 reaches 30%
const SUYA = 'Suya platter';      // price 200, cost 50: 25.0%, 166.67 reaches 30%
const CHIN = 'Chin chin';         // price 300, cost 60, never below 250: 20.0%, 200.00 reaches 30%

async function ownerInApp(page: Page, type = 'Bar'): Promise<Registered> {
  const who = await registerViaUi(page, { type });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function newItem(page: Page, name: string, price: string, cost: string, minimum?: string): Promise<void> {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('item-cost').fill(cost);
  if (minimum) await page.getByTestId('item-minimum-price').fill(minimum);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${name}`)).toBeVisible();
}

async function threeDishes(page: Page, type = 'Bar'): Promise<Registered> {
  const who = await ownerInApp(page, type);
  await newItem(page, RICE, '100', '20');
  await newItem(page, SUYA, '200', '50');
  await newItem(page, CHIN, '300', '60', '250');
  return who;
}

async function openFoodCost(page: Page): Promise<void> {
  await page.goto('/app/inventory/food-cost');
  await expect(page.getByTestId(`dish-${RICE}`)).toBeVisible();
}

const price = (page: Page, name: string) => page.getByTestId(`dish-price-${name}`);
const target = (page: Page, name: string) => page.getByTestId(`dish-target-${name}`);
const percent = (page: Page, name: string) => page.getByTestId(`dish-percent-${name}`);
const suggested = (page: Page, name: string) => page.getByTestId(`dish-suggested-${name}`);
const count = (page: Page) => page.getByTestId('foodcost-count');

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

test.describe('Food cost: single edits', () => {
  test('typing a price moves the food cost % at once; a target of its own changes the price for the target, is kept, and survives a reload', async ({ page }) => {
    test.slow();
    await threeDishes(page);
    await openFoodCost(page);

    await expect(percent(page, RICE)).toHaveText('20%');
    await expect(suggested(page, RICE)).toHaveText('66.67');
    await expect(price(page, RICE)).toHaveValue('100.00');
    await expect(target(page, RICE)).toHaveValue('');
    await expect(target(page, RICE)).toHaveAttribute('placeholder', '30');                      // it follows the food cost wanted above
    await expect(count(page)).toContainText('No changes yet');
    await expect(page.getByTestId('foodcost-save-all')).toBeDisabled();

    // The price is typed: its food cost % follows at once, and the row says it has changed (in words as well as colour).
    await price(page, RICE).fill('80');
    await expect(percent(page, RICE)).toHaveText('25%');
    await expect(page.getByTestId(`dish-changed-${RICE}`)).toHaveText('Changed');
    await expect(count(page)).toContainText('1 change');
    await expect(suggested(page, RICE)).toHaveText('66.67');                                      // the price asked for does not depend on the price it has now
    await expect(percent(page, SUYA)).toHaveText('25%');                                          // the other dishes are untouched
    await expect(page.getByTestId(`dish-changed-${SUYA}`)).toHaveCount(0);

    // A target of its own: the price for it follows at once and says which target it is for.
    await target(page, RICE).fill('25');
    await expect(suggested(page, RICE)).toContainText('80.00');
    await expect(suggested(page, RICE)).toContainText('at 25%');
    await expect(page.getByTestId(`dish-apply-${RICE}`)).toHaveCount(0);                          // a changed dish is saved, not given the one-click price

    // Saving asks first, naming what will change.
    await page.getByTestId(`dish-save-${RICE}`).click();
    const dialog = page.getByRole('dialog', { name: `Save ${RICE}?` });
    await expect(dialog).toContainText('price 100.00 to 80.00');
    await expect(dialog).toContainText('its own target from the 30% you want to 25%');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByText(`${RICE} saved.`)).toBeVisible();
    await expect(page.getByTestId(`dish-changed-${RICE}`)).toHaveCount(0);
    await expect(count(page)).toContainText('No changes yet');
    await expect(price(page, RICE)).toHaveValue('80.00');
    await expect(percent(page, RICE)).toHaveText('25%');

    // It is the server's figure now: after a reload the price, the target of its own and the price for it are all still there.
    await page.reload();
    await expect(price(page, RICE)).toHaveValue('80.00');
    await expect(target(page, RICE)).toHaveValue('25');
    await expect(percent(page, RICE)).toHaveText('25%');
    await expect(suggested(page, RICE)).toContainText('80.00');
    await expect(suggested(page, RICE)).toContainText('at 25%');

    // Empty again (the x), and the dish follows the screen's target once more.
    await page.getByTestId(`dish-target-clear-${RICE}`).click();
    await expect(target(page, RICE)).toHaveValue('');
    await expect(suggested(page, RICE)).toContainText('66.67');
    await page.getByTestId(`dish-save-${RICE}`).click();
    await expect(page.getByRole('dialog', { name: `Save ${RICE}?` })).toContainText('its own target of 25% removed');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByText(`${RICE} saved.`)).toBeVisible();
    await page.reload();
    await expect(target(page, RICE)).toHaveValue('');
    await expect(suggested(page, RICE)).toHaveText('66.67');

    // The one-click price is still there for a dish nobody has changed.
    await page.getByTestId(`dish-apply-${SUYA}`).click();
    await page.getByTestId('confirm-ok').click();
    await expect(percent(page, SUYA)).toHaveText('30%');
  });

  test('three dishes are edited and saved once; one price below its minimum fails by name while the others are saved, and what was typed for it stays', async ({ page }) => {
    test.slow();
    await threeDishes(page);
    await openFoodCost(page);

    // Discard throws away everything typed and not saved.
    await price(page, RICE).fill('10');
    await target(page, SUYA).fill('50');
    await expect(count(page)).toContainText('2 changes');
    await page.getByTestId('foodcost-discard').click();
    await expect(price(page, RICE)).toHaveValue('100.00');
    await expect(target(page, SUYA)).toHaveValue('');
    await expect(count(page)).toContainText('No changes yet');
    await expect(page.getByTestId(`dish-changed-${RICE}`)).toHaveCount(0);
    await expect(suggested(page, SUYA)).toHaveText('166.67');

    // Three dishes, one save. Chin chin may not go below 250, and is also given a target of its own.
    await price(page, RICE).fill('90');
    await price(page, SUYA).fill('180');
    await price(page, CHIN).fill('100');
    await target(page, CHIN).fill('40');
    await expect(count(page)).toContainText('3 changes');
    await page.getByTestId('foodcost-save-all').click();
    const dialog = page.getByRole('dialog', { name: 'Save changes to 3 dishes?' });
    for (const line of [RICE, SUYA, CHIN]) await expect(dialog).toContainText(line);
    await expect(dialog).toContainText('price 300.00 to 100.00');
    await page.getByTestId('confirm-ok').click();

    // The one that was refused is named with the server's words; the others are saved.
    const failed = page.getByTestId('foodcost-failed');
    await expect(failed).toBeVisible();
    await expect(page.getByTestId(`foodcost-failed-${CHIN}`)).toContainText(/minimum/i);
    await expect(failed).not.toContainText(RICE);
    await expect(failed).not.toContainText(SUYA);
    await expect(price(page, RICE)).toHaveValue('90.00');
    await expect(price(page, SUYA)).toHaveValue('180.00');
    await expect(page.getByTestId(`dish-changed-${RICE}`)).toHaveCount(0);
    await expect(page.getByTestId(`dish-changed-${SUYA}`)).toHaveCount(0);

    // What was typed for Chin chin is still in its box, still marked, and the count says one is left.
    await expect(price(page, CHIN)).toHaveValue('100');
    await expect(page.getByTestId(`dish-changed-${CHIN}`)).toBeVisible();
    await expect(count(page)).toContainText('1 change');
    await expect(target(page, CHIN)).toHaveValue('40');                                           // its target was kept by the server

    // Put right and saved, the list of what failed goes.
    await price(page, CHIN).fill('260');
    await page.getByTestId(`dish-save-${CHIN}`).click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByText(`${CHIN} saved.`)).toBeVisible();
    await expect(page.getByTestId('foodcost-failed')).toHaveCount(0);
    await page.reload();
    await expect(price(page, RICE)).toHaveValue('90.00');
    await expect(price(page, SUYA)).toHaveValue('180.00');
    await expect(price(page, CHIN)).toHaveValue('260.00');
    await expect(target(page, CHIN)).toHaveValue('40');
    await expect(percent(page, CHIN)).toHaveText('23.1%');                                        // 60 of 260
  });

  test('what cannot be saved is said in plain words next to the box, and nothing can be sent until it is put right', async ({ page }) => {
    test.slow();
    await threeDishes(page);
    await openFoodCost(page);

    await price(page, RICE).fill('0');
    await expect(page.getByTestId(`dish-price-error-${RICE}`)).toHaveText('The price must be above zero.');
    await expect(price(page, RICE)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId(`dish-save-${RICE}`)).toBeDisabled();
    await target(page, SUYA).fill('150');
    await expect(page.getByTestId(`dish-target-error-${SUYA}`)).toHaveText('The target must be from 1 to 99.');
    await expect(count(page)).toContainText('2 dishes need fixing first');
    await expect(page.getByTestId('foodcost-save-all')).toBeDisabled();

    await price(page, RICE).fill('');
    await expect(page.getByTestId(`dish-price-error-${RICE}`)).toBeVisible();
    await price(page, RICE).fill('95');
    await target(page, SUYA).fill('0');
    await expect(page.getByTestId(`dish-target-error-${SUYA}`)).toBeVisible();
    await target(page, SUYA).fill('35');
    await expect(page.getByTestId(`dish-price-error-${RICE}`)).toHaveCount(0);
    await expect(page.getByTestId(`dish-target-error-${SUYA}`)).toHaveCount(0);
    await expect(count(page)).toContainText('2 changes');
    await expect(page.getByTestId('foodcost-save-all')).toBeEnabled();
  });

  test('with tax in the prices, the page follows a typed price the way the server does', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.goto('/app/settings/operations');
    await page.getByTestId('tax-name').fill('VAT');
    await page.getByTestId('tax-rate').fill('10');
    await page.getByTestId('tax-inclusive').check();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');
    await newItem(page, RICE, '110', '20');                                                       // 100 without the tax: 20%
    await openFoodCost(page);
    await expect(percent(page, RICE)).toHaveText('20%');
    await expect(suggested(page, RICE)).toHaveText('73.33');                                      // 20 / 0.30 = 66.67, with the 10% tax put back

    await price(page, RICE).fill('88');                                                           // 80 without the tax: 25%
    await target(page, RICE).fill('25');
    await expect(percent(page, RICE)).toHaveText('25%');
    await expect(suggested(page, RICE)).toContainText('88.00');
    await page.getByTestId(`dish-save-${RICE}`).click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByText(`${RICE} saved.`)).toBeVisible();

    // The figures the server worked out for the saved dish are the ones the page had shown.
    await page.reload();
    await expect(price(page, RICE)).toHaveValue('88.00');
    await expect(percent(page, RICE)).toHaveText('25%');
    await expect(suggested(page, RICE)).toContainText('88.00');
  });

  test('a person who may see costs but not set prices sees the figures as plain text, with no boxes and no way to save', async ({ page, browser }) => {
    test.slow();
    const who = await threeDishes(page);
    await page.goto('/app/staff');
    await page.getByTestId('add-staff').click();
    await page.getByTestId('new-name').fill('Ada Accounts');
    await page.getByTestId('new-pin').fill('7391');
    await page.getByTestId('new-role-accountant').check();
    await page.getByTestId('create-staff').click();
    const code = (await page.getByTestId('staff-added-code').innerText()).trim();
    await page.getByTestId('staff-added-done').click();

    const ada = await newContext(browser);
    await ada.page.goto('/login');
    await ada.page.getByTestId('login-slug').fill(who.slug);
    await ada.page.getByTestId('mode-pin').click();
    await ada.page.getByTestId('login-code').fill(code);
    await ada.page.getByTestId('login-pin').fill('7391');
    await ada.page.getByTestId('login-submit').click();
    await expect(ada.page).toHaveURL(/\/app\/dashboard/);
    await ada.page.goto('/app/inventory/food-cost');
    await expect(ada.page.getByTestId(`dish-${RICE}`)).toBeVisible();
    await expect(ada.page.getByTestId(`dish-${RICE}`)).toContainText('100.00');
    await expect(percent(ada.page, RICE)).toHaveText('20%');
    await expect(price(ada.page, RICE)).toHaveCount(0);
    await expect(target(ada.page, RICE)).toHaveCount(0);
    await expect(ada.page.getByTestId('foodcost-bar')).toHaveCount(0);
    await expect(ada.page.getByTestId(`dish-save-${RICE}`)).toHaveCount(0);
    await expect(ada.page.getByTestId(`dish-apply-${RICE}`)).toHaveCount(0);
    await ada.context.close();
  });
});

test.describe('Food cost: edits in both themes and on a phone', () => {
  async function editedRow(page: Page, theme: 'dark' | 'light'): Promise<void> {
    await openFoodCost(page);
    await target(page, SUYA).fill('35');                                                          // a changed row, with nothing wrong yet
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    if (theme === 'dark') expect(Number(canvas.split(/\s+/)[0]), `the theme under test is dark (canvas ${canvas})`).toBeLessThan(80);
    else expect(Number(canvas.split(/\s+/)[0]), `the theme under test is light (canvas ${canvas})`).toBeGreaterThan(180);
    for (const [what, selector] of [
      ['the price in its box', `[data-testid="dish-price-${RICE}"]`],
      ['the target in its box', `[data-testid="dish-target-${SUYA}"]`],
      ['the word Changed', `[data-testid="dish-changed-${SUYA}"] span`],
      ['the count of changes', '[data-testid="foodcost-count"]'],
      ['the food cost % of a changed row', `[data-testid="dish-percent-${SUYA}"]`],
      ['the price for the target of a changed row', `[data-testid="dish-suggested-${SUYA}"]`],
      ['the Save changes button', '[data-testid="foodcost-save-all"]'],
      ['a row Save button', `[data-testid="dish-save-${SUYA}"]`]
    ] as const) expect(await contrastOf(page, selector), `${what} in the ${theme} theme`).toBeGreaterThanOrEqual(4.5);

    await price(page, RICE).fill('0');                                                            // now something wrong: its message, in the row that is marked
    for (const [what, selector] of [
      ['the error under the price', `[data-testid="dish-price-error-${RICE}"]`],
      ['the note that a dish needs fixing', '[data-testid="foodcost-count"] span']
    ] as const) expect(await contrastOf(page, selector), `${what} in the ${theme} theme`).toBeGreaterThanOrEqual(4.5);
  }

  test('in a dark theme the boxes, the marks and the messages are readable', async ({ page }) => {
    test.slow();
    await threeDishes(page, 'Nightclub');
    await editedRow(page, 'dark');
  });

  test('in a light theme they are readable, and on a phone the page does not scroll sideways while the table scrolls inside its card', async ({ page }) => {
    test.slow();
    await threeDishes(page, 'Restaurant');
    await editedRow(page, 'light');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('foodcost-bar')).toBeVisible();
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.scrollWidth - document.documentElement.clientWidth }));
    expect(overflow.page, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    expect(overflow.body, 'the body scrolls sideways').toBeLessThanOrEqual(0);
    const table = await page.evaluate(() => { const el = document.querySelector('[data-testid="foodcost-table"]')!.parentElement!; return { inner: el.scrollWidth, outer: el.clientWidth }; });
    expect(table.inner, 'the table is wider than the phone, so it scrolls inside its card').toBeGreaterThan(table.outer);

    // The buttons of the bar can be reached on a phone, and the boxes can be reached with the keyboard.
    await expect(page.getByTestId('foodcost-discard')).toBeVisible();
    await price(page, RICE).focus();
    await page.keyboard.press('Tab');
    await expect(target(page, RICE)).toBeFocused();
    await page.getByTestId('foodcost-discard').click();
    await expect(count(page)).toContainText('No changes yet');
  });
});

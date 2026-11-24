import { Page, expect, test } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screenshotIds } from '../src/app/features/help/manual.content';
import { choose, registerViaUi } from './helpers';

/**
 * Takes the pictures the manual shows, from the real application with demonstration data: a lounge that cooks, in the light theme, at 1280 x 800.
 * It does NOTHING unless MANUAL_SCREENSHOTS=1 (it registers a company and writes bills, and it is slow), so it never runs with the ordinary suite.
 *
 *   PowerShell:  $env:MANUAL_SCREENSHOTS = '1'; npx playwright test e2e/manual-screenshots.spec.ts
 *
 * The pictures land in public/manual/img/<id>.png, where the manual's `screenshot` blocks look for them (the ids it needs are
 * src/app/features/help/manual.content.ts `screenshotIds()`). Only website screens are photographed: the phone app is described in words.
 * A picture that cannot be taken is reported at the end with the reason and the rest carry on, so one stubborn screen never loses the others.
 * Everything shown is made-up: a company called Harbour Lounge, people named for their jobs, items and amounts that mean nothing.
 */
const ENABLED = process.env['MANUAL_SCREENSHOTS'] === '1';
const OUT = join(__dirname, '..', 'public', 'manual', 'img');
/**
 * Pictures are first saved OUTSIDE the application's folders and copied into public/manual/img only when the run ends. The development server
 * watches `public` and reloads the browser page whenever a file appears there, which would have thrown the page away in the middle of the set-up.
 */
let SHOTS = '';   // made when the run starts, so that skipping this file creates nothing

const taken: string[] = [];
const failed: { what: string; why: string }[] = [];

/** Runs one stage of the set-up. A stage that fails is noted and the next one still runs (it may need what this one made, and will say so). */
async function stage(what: string, work: () => Promise<void>): Promise<void> {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${what}`);
  try { await work(); } catch (e) { failed.push({ what, why: String(e instanceof Error ? e.message : e).split('\n').slice(0, 3).join(' ').slice(0, 300) }); }
}

/** Photographs the page as it is now. A floating prompt is put away first so it never sits over a screen's own words. */
async function shoot(page: Page, id: string, ready?: () => Promise<void>): Promise<void> {
  await stage(`picture ${id}`, async () => {
    if (ready) await ready();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // A message that says "Saved." fades by itself; wait for it to go so it does not sit over the picture.
    await page.waitForFunction(() => !(document.querySelector('zp-toast-host')?.textContent ?? '').trim(), undefined, { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Later' }).first().click({ timeout: 500 }).catch(() => undefined);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(SHOTS, `${id}.png`), type: 'png' });
    taken.push(id);
  });
}

/**
 * Chooses the first entry whose words contain the text, in a native select or in a searchable list (zp-search-select, which lists an exact
 * name first, then the names that start with the words). The entries of a list read from the server arrive a moment after the box is drawn,
 * so the words are typed again until the list shows an entry.
 */
async function chooseContaining(page: Page, testId: string, text: string): Promise<void> {
  const select = page.getByTestId(testId);
  if (await select.evaluate((el) => el.tagName !== 'SELECT')) {
    for (let waited = 0; waited < 15_000; waited += 300) {
      await select.click();
      await select.fill(text);
      if (await page.getByTestId(`${testId}-list`).locator('[role="option"][data-value]').count()) { await select.press('Enter'); return; }
      await page.waitForTimeout(300);
    }
    throw new Error(`No choice containing "${text}" in ${testId}`);
  }
  // An exact name (or the name followed by its unit) is preferred, so "Rice" is not the dish "Jollof rice with chicken".
  const find = (): Promise<string | null> => select.evaluate((el, t) => {
    const want = String(t).toLowerCase();
    const options = [...(el as HTMLSelectElement).options];
    const found = options.find((o) => o.text.trim().toLowerCase() === want || o.text.trim().toLowerCase().startsWith(`${want} (`)) ?? options.find((o) => o.text.toLowerCase().includes(want));
    return found ? found.value : null;
  }, text);
  // The choices of a list that is read from the server arrive a moment after the box is drawn: look for up to fifteen seconds.
  let value = await find();
  for (let waited = 0; value === null && waited < 15_000; waited += 300) { await page.waitForTimeout(300); value = await find(); }
  if (value === null) throw new Error(`No choice containing "${text}" in ${testId}`);
  await select.selectOption(value);
}

async function addStaff(page: Page, name: string, roleKey: string, pin: string): Promise<void> {
  await page.goto('/app/staff');
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  await page.getByTestId('create-staff').click();
  await page.getByTestId('staff-added-done').click();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
}

interface ItemSpec {
  name: string; kind?: 'FinishedGood' | 'Ingredient'; unit?: 'Each' | 'Gram' | 'Milliliter'; price?: string; cost?: string; barcode?: string; group?: string;
  shelf?: string; warn?: string; portions?: string; target?: string;
}

async function newItem(page: Page, i: ItemSpec): Promise<void> {
  await page.goto('/app/inventory/items');
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-name').fill(i.name);
  if (i.kind) await page.getByTestId('item-kind').selectOption(i.kind);
  if (i.unit) await page.getByTestId('item-unit').selectOption(i.unit);
  if (i.price) await page.getByTestId('item-price').fill(i.price);
  if (i.cost) await page.getByTestId('item-cost').fill(i.cost);
  if (i.barcode) await page.getByTestId('item-barcode').fill(i.barcode);
  if (i.group) await choose(page, 'item-group', i.group);
  if (i.shelf) await page.getByTestId('item-shelf-life').fill(i.shelf);
  if (i.warn) await page.getByTestId('item-expiry-alert').fill(i.warn);
  if (i.portions) await page.getByTestId('item-portions').fill(i.portions);
  if (i.target) await page.locator('#sc-target, #sc-ts').first().fill(i.target);
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId(`item-${i.name}`)).toBeVisible();
}

const INGREDIENTS: ItemSpec[] = [
  { name: 'Rice', kind: 'Ingredient', unit: 'Gram', cost: '1.1', barcode: '6001000000011', group: 'Ingredients' },
  { name: 'Chicken', kind: 'Ingredient', unit: 'Gram', cost: '4.2', barcode: '6001000000028', group: 'Ingredients', shelf: '3' },
  { name: 'Tomato', kind: 'Ingredient', unit: 'Gram', cost: '0.9', barcode: '6001000000035', group: 'Ingredients', shelf: '5' },
  { name: 'Flour', kind: 'Ingredient', unit: 'Gram', cost: '1', barcode: '6001000000042', group: 'Ingredients' },
  { name: 'Eggs', kind: 'Ingredient', unit: 'Each', cost: '60', barcode: '6001000000059', group: 'Ingredients', shelf: '14' },
  { name: 'Chocolate', kind: 'Ingredient', unit: 'Gram', cost: '5.5', barcode: '6001000000066', group: 'Ingredients' }
];

const SOLD: ItemSpec[] = [
  { name: 'Jollof rice with chicken', price: '4500', group: 'Food', target: '20' },
  { name: 'Chocolate cake', price: '1800', group: 'Food', portions: '8', shelf: '3', warn: '1', target: '8' },
  { name: 'Lager', price: '1200', cost: '650', barcode: '6001000000073', group: 'Drinks' },
  { name: 'Gin and tonic', price: '2500', cost: '900', barcode: '6001000000080', group: 'Drinks' }
];

test.describe('The manual\'s pictures', () => {
  test.skip(!ENABLED, 'Set MANUAL_SCREENSHOTS=1 to take the manual\'s pictures.');
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', deviceScaleFactor: 1 });

  test('photograph the key screens of a demonstration lounge', async ({ page }) => {
    test.setTimeout(45 * 60_000);
    SHOTS = mkdtempSync(join(tmpdir(), 'zp-manual-'));

    // A bar man's floating button and prompt would sit over the screens; the manual describes them in words.
    await page.addInitScript(() => {
      const hide = (): void => { const s = document.createElement('style'); s.textContent = 'zp-bar-dock { display: none !important; }'; document.head.appendChild(s); };
      if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide);
    });

    // ---- Registration and the brand step -------------------------------------------------------------------------------------------------------
    await page.goto('/register');
    await expect(page.getByTestId('enterprise-type')).toBeVisible();
    await shoot(page, 'register-type');
    await registerViaUi(page, { name: 'Harbour Lounge', type: 'Lounge', barManMethod: true });
    await shoot(page, 'onboarding-brand', async () => { await page.getByTestId('tab-colors').click(); await expect(page.getByTestId('preset-select')).toBeVisible(); });
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim()), { timeout: 15_000 }).not.toBe('11 18 32');   // the company's own (light) colours have been applied
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    console.log(`The demonstration company's canvas colour is ${canvas} (a light theme has a high first number).`);

    // ---- Stations, printers, tables ------------------------------------------------------------------------------------------------------------
    await stage('station Kitchen', async () => {
      await page.goto('/app/settings/stations');
      await page.getByTestId('station-new').click();
      await page.getByTestId('station-name').fill('Kitchen');
      await page.getByTestId('station-save').click();
      await expect(page.getByTestId('station-row-Kitchen')).toBeVisible();
    });
    await shoot(page, 'stations', async () => { await page.goto('/app/settings/stations'); await expect(page.getByTestId('station-row-Kitchen')).toBeVisible(); });

    await stage('printers', async () => {
      await page.goto('/app/settings/printers');
      await page.getByTestId('printer-new').click();
      await page.getByTestId('printer-name').fill('Counter');
      await page.getByTestId('printer-host').fill('192.168.1.50');
      await page.getByTestId('printer-paper').selectOption({ label: '80 mm (wide)' });
      await page.getByTestId('printer-purpose-Reports').check();
      await page.getByTestId('printer-save').click();
      await expect(page.getByTestId('printer-row-Counter')).toBeVisible();
      await page.getByTestId('printer-new').click();
      await page.getByTestId('printer-name').fill('Kitchen printer');
      await page.getByTestId('printer-host').fill('192.168.1.51');
      await page.getByTestId('printer-paper').selectOption({ label: '80 mm (wide)' });
      await page.getByTestId('printer-purpose-Receipts').uncheck();
      await page.getByTestId('printer-purpose-Kitchen').check();
      await page.getByTestId('printer-station-Kitchen').check();
      await page.getByTestId('printer-save').click();
      await expect(page.getByTestId('printer-row-Kitchen printer')).toBeVisible();
    });
    await shoot(page, 'printers', async () => { await page.goto('/app/settings/printers'); await expect(page.getByTestId('printer-list')).toBeVisible(); });

    await stage('tables', async () => {
      await page.goto('/app/settings/tables');
      await page.getByTestId('table-many').click();
      await page.getByTestId('many-prefix').fill('Table');
      await page.getByTestId('many-from').fill('1');
      await page.getByTestId('many-to').fill('8');
      await page.getByTestId('many-area').fill('Main floor');
      await page.getByTestId('many-seats').fill('4');
      await page.getByTestId('many-save').click();
      await expect(page.getByTestId('table-list')).toContainText('Table 8');
    });
    await shoot(page, 'tables', async () => { await page.goto('/app/settings/tables'); await expect(page.getByTestId('table-list')).toContainText('Table 1'); });

    // ---- Stock groups and items ------------------------------------------------------------------------------------------------------------------
    await stage('groups', async () => {
      await page.goto('/app/inventory/groups');
      for (const [name, station] of [['Food', 'Kitchen'], ['Drinks', ''], ['Ingredients', 'Kitchen']] as const) {
        await page.getByTestId('group-new').click();
        await page.getByTestId('group-name').fill(name);
        if (station) await choose(page, 'group-station', station);
        await page.getByTestId('group-save').click();
        await expect(page.getByTestId(`group-${name}`)).toBeVisible();
      }
    });
    await shoot(page, 'stock-groups', async () => { await page.goto('/app/inventory/groups'); await expect(page.getByTestId('group-Food')).toBeVisible(); });

    for (const item of [...INGREDIENTS, ...SOLD]) await stage(`item ${item.name}`, () => newItem(page, item));
    await shoot(page, 'items-list', async () => { await page.goto('/app/inventory/items'); await expect(page.getByTestId('items-table')).toContainText('Chocolate cake'); });

    // ---- Recipes ------------------------------------------------------------------------------------------------------------------------------
    await stage('recipe of the rice dish', async () => {
      await page.goto('/app/inventory/items');
      await page.getByTestId('item-edit-Jollof rice with chicken').click();
      await page.getByTestId('sc-tab-recipe').click();
      await expect(page.getByTestId('recipe-editor')).toBeVisible();
      const lines: [string, string, string][] = [['Rice', '200', '100'], ['Chicken', '150', '100'], ['Tomato', '120', '85']];
      for (const [i, [name, qty, usable]] of lines.entries()) {
        await page.getByTestId('add-ingredient').click();
        await chooseContaining(page, `ing-item-${i}`, name);
        await page.getByTestId(`ing-qty-${i}`).fill(qty);
        await page.getByTestId(`ing-usable-${i}`).fill(usable);
      }
      await page.getByTestId('save-recipe').click();
      await expect(page.getByTestId('recipe-msg')).toBeVisible();
    });
    await shoot(page, 'recipe-tab');
    await stage('close the card', async () => { await page.getByTestId('sc-close').click(); });

    await stage('batch recipe of the cake', async () => {
      await page.goto('/app/inventory/items');
      await page.getByTestId('item-edit-Chocolate cake').click();
      await page.getByTestId('sc-tab-recipe').click();
      await expect(page.getByTestId('batch-editor')).toBeVisible();
      const lines: [string, string][] = [['Flour', '400'], ['Eggs', '4'], ['Chocolate', '150']];
      for (const [i, [name, qty]] of lines.entries()) {
        await page.getByTestId('batch-add').click();
        await chooseContaining(page, `batch-item-${i}`, name);
        await page.getByTestId(`batch-qty-${i}`).fill(qty);
      }
      await page.getByTestId('batch-save').click();
      await expect(page.getByTestId('batch-msg')).toBeVisible();
    });
    await shoot(page, 'batch-recipe', async () => { await page.getByTestId('batch-cost').scrollIntoViewIfNeeded(); });
    await stage('the cake\'s details tab', async () => { await page.getByTestId('sc-tab-details').click(); });
    await shoot(page, 'stock-card', async () => { await page.getByTestId('item-portions').scrollIntoViewIfNeeded(); });
    await stage('close the card', async () => { await page.getByTestId('sc-close').click(); });

    // ---- Bins ---------------------------------------------------------------------------------------------------------------------------------
    await stage('bins', async () => {
      await page.goto('/app/inventory/bins');
      await page.waitForLoadState('networkidle');
      const bins: [string, string, boolean, string][] = [['MAIN-1', 'Main shelf', false, ''], ['COLD-1', 'Cold room', false, ''], ['CAGE-1', 'Spirits cage', true, ''], ['KIT-1', 'Kitchen\'s own place', false, 'Kitchen']];
      for (const [code, name, secure, station] of bins) {
        await page.getByTestId('bin-new').click();
        await page.getByTestId('bin-code').fill(code);
        await page.getByTestId('bin-name').fill(name);
        if (secure) await page.getByTestId('bin-secure').check();
        if (station) await choose(page, 'bin-station', station);
        await page.getByTestId('bin-save').click();
        await expect(page.getByTestId(`bin-row-${code}`)).toBeVisible();
      }
    });
    await shoot(page, 'bins', async () => { await page.goto('/app/inventory/bins'); await expect(page.getByTestId('bin-row-KIT-1')).toBeVisible(); });

    // ---- People and roles ------------------------------------------------------------------------------------------------------------------------
    await stage('staff', async () => {
      await addStaff(page, 'Wale Waiter', 'waiter', '7391');
      await addStaff(page, 'Kemi Cook', 'kitchen', '5927');
      await addStaff(page, 'Tunde Till', 'cashier', '3846');
      await addStaff(page, 'Bola Bar', 'bartender', '4821');
    });
    await stage('a role that works at the kitchen', async () => {
      await page.goto('/app/staff');
      await page.getByTestId('tab-roles').click();
      await page.getByTestId('new-role').click();
      await page.getByTestId('role-name').fill('Line cook');
      await page.getByTestId('perm-pos.view').check();
      await page.getByTestId('perm-pos.bar_order.fulfil').check();
      await expect(page.getByTestId('role-stations')).toBeVisible();
      await page.getByTestId('role-station-Kitchen').check();
      await page.getByTestId('save-role').click();
      await expect(page.getByTestId('role-Line cook')).toBeVisible();
      await page.getByTestId('role-Line cook').click();
    });
    await shoot(page, 'roles', async () => { await page.getByTestId('role-stations').scrollIntoViewIfNeeded(); });
    await shoot(page, 'staff-list', async () => { await page.goto('/app/staff'); await expect(page.getByRole('row').filter({ hasText: 'Kemi Cook' })).toBeVisible(); });

    // ---- Buying, receiving, a market run, a store issue and a batch ---------------------------------------------------------------------------------
    let orderUrl = '';
    await stage('a purchase order', async () => {
      await page.goto('/app/purchasing/orders/new');
      await page.waitForLoadState('networkidle');
      await page.getByTestId('po-supplier-new').click();
      await page.getByTestId('supplier-name').fill('Island Foods Ltd');
      await page.getByTestId('supplier-email').fill('orders@island-foods.example');
      await page.getByTestId('supplier-limit').fill('2000000');
      await page.getByTestId('supplier-save').click();
      await expect(page.getByTestId('po-supplier-name')).toHaveText('Island Foods Ltd');
      const lines: [string, string, string, string][] = [['6001000000011', '20000', '1.1', 'MAIN'], ['6001000000028', '10000', '4.2', 'COLD'], ['6001000000042', '15000', '1', 'MAIN'], ['6001000000059', '120', '60', 'COLD']];
      for (const [i, [barcode, qty, cost, bin]] of lines.entries()) {
        await page.getByTestId('po-scan').fill(barcode);
        await page.getByTestId('po-scan').press('Enter');
        await expect(page.getByTestId(`line-${i}`)).toBeVisible();
        await page.getByTestId(`line-qty-${i}`).fill(qty);
        await page.getByTestId(`line-cost-${i}`).fill(cost);
        await chooseContaining(page, `line-bin-${i}`, bin);
      }
      await page.getByTestId('po-post').click();
      await page.getByTestId('confirm-ok').click();
      await expect(page.getByTestId('po-status')).toContainText('Posted');
      await page.getByTestId('po-approve').click();
      await expect(page.getByTestId('po-status')).toContainText('Approved');
      orderUrl = page.url();
    });
    await stage('receive the order', async () => {
      await page.getByTestId('po-receive').click();
      await expect(page.getByTestId('rcv-doc')).toBeVisible();
      await page.getByTestId('rcv-all').click();
    });
    await shoot(page, 'goods-receiving', async () => { await expect(page.getByTestId('rcv-commit')).toBeEnabled(); });
    await stage('commit the receipt', async () => {
      await page.getByTestId('rcv-commit').click();
      await page.getByTestId('confirm-ok').click();
      await expect(page.getByTestId('grn-status')).toBeVisible();
    });

    await stage('a market run', async () => {
      await page.goto('/app/purchasing/market-runs');
      await page.getByTestId('run-new').click();
      await page.getByTestId('run-market').fill('Mile 12 market');
      await page.getByTestId('run-given').fill('15500');
      await page.getByTestId('run-change').fill('500');
      await chooseContaining(page, 'run-item-0', 'Tomato');
      await page.getByTestId('run-qty-0').fill('8000');
      await page.getByTestId('run-paid-0').fill('6400');
      await page.getByTestId('run-add-line').click();
      await chooseContaining(page, 'run-item-1', 'Eggs');
      await page.getByTestId('run-qty-1').fill('90');
      await page.getByTestId('run-paid-1').fill('5100');
      const expenses: [string, string, string][] = [['Transport', '1500', 'Taxi to the market and back'], ['LoadersAndCarriers', '1500', 'Two loaders for the sacks'], ['LocalLeviesAndSecurity', '500', 'Gate fee charged by the market union']];
      for (const [i, [category, amount, why]] of expenses.entries()) {
        await page.getByTestId('run-add-expense').click();
        await page.getByTestId(`run-exp-cat-${i}`).selectOption(category);
        await page.getByTestId(`run-exp-amount-${i}`).fill(amount);
        await page.getByTestId(`run-exp-why-${i}`).fill(why);
      }
      await expect(page.getByTestId('run-diff')).toContainText('0.00');
      await page.getByTestId('run-save').click();
      await expect(page.getByTestId('run-row-1')).toBeVisible();
    });
    await shoot(page, 'market-runs', async () => { await page.goto('/app/purchasing/market-runs'); await expect(page.getByTestId('run-row-1')).toBeVisible(); });

    await stage('a store issue', async () => {
      await page.goto('/app/inventory/issues');
      await page.getByTestId('issue-new').click();
      await chooseContaining(page, 'ask-station', 'Kitchen');
      await chooseContaining(page, 'ask-item-0', 'Flour');
      await page.getByTestId('ask-qty-0').fill('3000');
      await page.getByTestId('ask-add').click();
      await chooseContaining(page, 'ask-item-1', 'Rice');
      await page.getByTestId('ask-qty-1').fill('5000');
      await page.getByTestId('ask-send').click();
      await expect(page.getByTestId('issue-row-1')).toBeVisible();
    });
    await shoot(page, 'store-issues', async () => { await page.goto('/app/inventory/issues'); await expect(page.getByTestId('issue-row-1')).toBeVisible(); });

    await stage('a batch of cake', async () => {
      await page.goto('/app/inventory/production');
      await chooseContaining(page, 'production-item', 'Chocolate cake');
      await page.getByTestId('production-actual').fill('7');
      await page.getByTestId('production-record').click();
      await expect(page.getByTestId('run-row-1')).toBeVisible();
    });
    await shoot(page, 'production', async () => {
      await page.goto('/app/inventory/production');
      await expect(page.getByTestId('run-row-1')).toBeVisible();
      // The form is filled in as it is while a batch is being recorded (not sent): the cake, and the seven slices that came out.
      await chooseContaining(page, 'production-item', 'Chocolate cake');
      await page.getByTestId('production-actual').fill('7');
      await expect(page.getByTestId('production-variance')).toBeVisible();
    });

    await stage('food cost', async () => {
      await page.goto('/app/inventory/food-cost');
      await page.getByTestId('foodcost-target').fill('30');
      await page.getByRole('button', { name: 'Work it out' }).click();
      await expect(page.getByTestId('foodcost-table')).toBeVisible();
    });
    await shoot(page, 'food-cost', async () => {
      await expect(page.getByTestId('foodcost-table')).toContainText('Chocolate cake');
      // A price and a target of its own are typed, not saved, so the picture shows the dish marked Changed and the bar above the table counting it.
      await page.getByTestId('dish-price-Chocolate cake').fill('1400');
      await page.getByTestId('dish-target-Chocolate cake').fill('25');
      await expect(page.getByTestId('dish-changed-Chocolate cake')).toBeVisible();
    });

    await shoot(page, 'prep-list', async () => {
      await page.goto('/app/inventory/reports/prep-list');
      await expect(page.getByTestId('report-table')).toBeVisible({ timeout: 30_000 });
    });

    // ---- A shift, bills at the till and on the kitchen display -----------------------------------------------------------------------------------
    // The Point of Sale asks for a shift first: the box that stands where the till would be, filled in but not sent (the shift is started on Start / End of Day below).
    await shoot(page, 'shift-gate', async () => {
      await page.goto('/app/pos');
      await expect(page.getByTestId('shift-box')).toBeVisible();
      await page.getByTestId('shift-box-float').fill('20000');
      await page.getByTestId('shift-box-confirm').check();
    });
    await stage('start a shift', async () => {
      await page.goto('/app/pos/day-management');
      await page.getByTestId('day-float').fill('20000');
      await page.getByTestId('day-float-confirm').check();
      await page.getByTestId('day-start-btn').click();
      await expect(page.getByTestId('day-status')).toHaveText('Open');
      await page.getByTestId('move-reason').fill('Float top-up for change');
      await page.getByTestId('move-amount').fill('5000');
      await page.getByTestId('move-add').click();
      await expect(page.getByTestId('day-movements')).toContainText('Float top-up');
      await page.getByTestId('move-kind').selectOption('CashOut');
      await page.getByTestId('move-reason').fill('Paid out for ice');
      await page.getByTestId('move-amount').fill('800');
      await page.getByTestId('move-add').click();
    });
    const openBill = async (table: string, label: string): Promise<void> => {
      await page.goto('/app/pos');
      await expect(page.getByTestId('product-grid')).toContainText('Lager');
      await page.getByTestId('new-bill').click();
      await page.getByTestId('nb-kind').selectOption('Table');
      await page.getByTestId(`nb-table-${table}`).click();
      await page.getByTestId('nb-label').fill(label);
      await page.getByTestId('nb-create').click();
    };
    const add = async (name: string, times = 1): Promise<void> => { for (let n = 0; n < times; n++) await page.getByTestId(`product-${name}`).click(); };

    await stage('a paid bill', async () => {
      await openBill('Table 1', 'Ade and friends');
      await add('Jollof rice with chicken', 2); await add('Chocolate cake');
      await page.getByTestId('pay').click();
      await page.getByTestId('pay-confirm').click();
      await expect(page.getByTestId('bill-status')).toHaveText('Paid');
    });
    await stage('a bill sent to the kitchen', async () => {
      await openBill('Table 2', 'Birthday party');
      await add('Jollof rice with chicken'); await add('Chocolate cake', 2);
      await page.getByTestId('send-order').dispatchEvent('click');
      await expect(page.getByTestId('bar-state-Chocolate cake')).toBeVisible();
    });
    await stage('a bill sent to the kitchen and the bar', async () => {
      await openBill('Table 5', 'Chika');
      await add('Jollof rice with chicken'); await add('Lager', 2);
      await page.getByTestId('send-order').dispatchEvent('click');
      await expect(page.getByTestId('bar-state-Lager')).toBeVisible();
    });
    await stage('a bill being written', async () => {
      await openBill('Table 4', 'Mr and Mrs Bello');
      await add('Jollof rice with chicken', 2); await add('Gin and tonic'); await add('Lager');
    });
    await shoot(page, 'day-management', async () => { await page.goto('/app/pos/day-management'); await expect(page.getByTestId('day-movements')).toBeVisible(); });
    await stage('back to the till', async () => { await page.goto('/app/pos'); await expect(page.getByTestId('bill-list')).toBeVisible(); await page.getByTestId('bill-Mr and Mrs Bello').click(); });
    await shoot(page, 'pos-till', async () => { await expect(page.getByTestId('current-bill')).toContainText('Jollof rice with chicken'); });

    await shoot(page, 'kitchen-display', async () => {
      await page.goto('/app/pos/kitchen');
      await chooseContaining(page, 'kds-station', 'Kitchen');
      await expect(page.getByTestId('kitchen-tickets')).toBeVisible();
    });

    await shoot(page, 'ledger', async () => {
      await page.goto('/app/ledger/accounts');
      await expect(page.getByTestId('accounts-table')).toBeVisible();
      await page.getByTestId('ledger-sync').click().catch(() => undefined);
      await page.waitForTimeout(1500);
    });

    // ---- The owner's views -------------------------------------------------------------------------------------------------------------------
    await stage('build yesterday\'s summary', async () => {
      await page.goto('/app/settings/daily-summary');
      await page.getByTestId('dss-build').click();
      await page.waitForTimeout(1500);
    });
    await shoot(page, 'daily-summary', async () => {
      await page.goto('/app/pos/reports/daily-summary');
      await expect(page.getByTestId('sum-detail')).toBeVisible({ timeout: 20_000 });
    });

    await stage('a second branch', async () => {
      await page.goto('/app/settings/branches');
      await page.getByTestId('add-branch').click();
      await page.getByTestId('branch-name').fill('Lekki Terrace');
      await page.getByTestId('branch-code').fill('LKT');
      await page.getByRole('textbox', { name: 'Address' }).fill('14 Admiralty Way, Lekki, Lagos').catch(() => undefined);
      await page.getByTestId('save-branch').click();
      // Saving a branch opens "Who works at Lekki Terrace?": skip it, the picture is of the branches list.
      await page.getByTestId('bp-done').click();
      await expect(page.getByTestId('branch-people')).toHaveCount(0);
    });
    await shoot(page, 'branches', async () => { await page.goto('/app/settings/branches'); await expect(page.getByText('Lekki Terrace')).toBeVisible(); });

    await shoot(page, 'dashboard', async () => { await page.goto('/app/dashboard'); await expect(page.getByTestId('main-nav')).toBeVisible(); });

    // ---- What was taken ------------------------------------------------------------------------------------------------------------------------
    mkdirSync(OUT, { recursive: true });
    for (const f of readdirSync(SHOTS)) copyFileSync(join(SHOTS, f), join(OUT, f));
    const wanted = screenshotIds();
    const missing = wanted.filter((id) => !taken.includes(id));
    let total = 0;
    for (const id of taken) { const size = statSync(join(SHOTS, `${id}.png`)).size; total += size; if (size > 200 * 1024) console.log(`  large: ${id}.png is ${(size / 1024).toFixed(0)} KB`); }
    console.log(`\nPictures taken: ${taken.length} of ${wanted.length} the manual shows, ${(total / 1024).toFixed(0)} KB in all.`);
    if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
    if (failed.length) console.log(`\nStages that failed:\n${failed.map((f) => `  - ${f.what}: ${f.why}`).join('\n')}`);
    void orderUrl;
    expect(missing, 'every picture the manual shows must have been taken').toEqual([]);
  });
});

import { Page, expect, test } from '@playwright/test';
import { PASSWORD, Registered, newContext, registerViaUi, openPos } from './helpers';

/**
 * Owner's decisions of 2026-11-15:
 *  - after a new stock item is saved the card closes and a small box offers "add another" or "finish setting this one up";
 *  - many items come in from a CSV file, checked first, all or nothing, and a row that matches an existing item refuses the file;
 *  - finding an item on a purchase order ignores letter case, and an order has a private web link to send to its supplier;
 *  - the till shows one mark per bar state with its total, Void asks how many, and the bar says how many it cannot make.
 */

async function ownerInApp(page: Page, opts: { type?: string; barManMethod?: boolean; demo?: boolean } = {}): Promise<Registered> {
  const who = await registerViaUi(page, { type: opts.type, barManMethod: opts.barManMethod });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  if (opts.demo) {
    await page.goto('/app/settings/operations');
    await page.getByTestId('seed-demo').click();
    await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);
  }
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

async function waitForSync(page: Page) {
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

/** Types a quantity into the row's box, as a cashier does for a large number. */
async function typeQuantity(page: Page, product: string, quantity: string) {
  const box = page.getByTestId(`line-${product}`).first().getByTestId('line-qty');
  await box.fill(quantity);
  await box.press('Enter');
  await expect(box).toHaveValue(quantity);
}

const csv = (...lines: string[]) => Buffer.from(lines.join('\r\n'), 'utf-8');

test.describe('Stock items: add another, and many from a file', () => {
  test('a saved item offers the next step, and a file is checked, refused with its reasons, then imported with opening stock', async ({ page }) => {
    test.slow();   // a long walk: two items by hand, five files, and the stock checked afterwards
    await ownerInApp(page);
    await page.goto('/app/inventory/items');

    // One after another: the card closes, the box offers to add another, and that opens a blank card.
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Alpha Water');
    await page.getByTestId('item-sku').fill('AW-1');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('stock-card')).toHaveCount(0);
    await expect(page.getByTestId('item-saved-name')).toHaveText('Alpha Water');
    await page.getByTestId('item-add-another').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: new item');
    await expect(page.getByTestId('item-name')).toHaveValue('');
    await expect(page.getByTestId('item-saved-prompt')).toHaveCount(0);
    await page.getByTestId('item-name').fill('Beta Juice');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-saved-name')).toHaveText('Beta Juice');

    // "Finish setting this one up" reopens the item just saved, on its set-up tabs.
    await page.getByTestId('item-finish').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: Beta Juice');
    await expect(page.getByTestId('unit-list')).toBeVisible();
    await page.getByTestId('sc-close').click();
    await expect(page.getByTestId('item-saved-prompt')).toHaveCount(0);                 // changing an existing item asks nothing

    // Many from a file. The template downloads with the headings.
    await page.getByTestId('item-import').click();
    const dialog = page.getByTestId('import-dialog');
    const download = page.waitForEvent('download');
    await dialog.getByTestId('import-template').click();
    expect((await download).suggestedFilename()).toBe('zestpoint-items-template.csv');
    await expect(dialog.getByTestId('import-confirm')).toBeDisabled();

    // A file that is not an items file says so in words.
    await dialog.getByTestId('import-file').setInputFiles({ name: 'wrong.csv', mimeType: 'text/csv', buffer: csv('Colour,Size', 'Red,Large') });
    await expect(dialog.getByTestId('import-file-error')).toContainText('no "Name" column');

    // Problems are listed by row and column, and nothing is imported: an existing item (in other letters), a missing name, a bad
    // number, and the same item twice in the file.
    await dialog.getByTestId('import-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: csv(
      'Name,SKU,Selling price,Opening quantity',
      'Gamma Cola,aw-1,500,',
      ',GC-2,500,',
      'Delta Beer,DB-1,lots,',
      'Epsilon Wine,EW-1,900,',
      'epsilon wine,EW-2,900,') });
    const errors = dialog.getByTestId('import-errors');
    await expect(errors).toContainText('Nothing was imported');
    await expect(errors).toContainText('SKU aw-1 is already used by Alpha Water');
    await expect(errors).toContainText('Every item needs a name.');
    await expect(errors).toContainText('This is not a number.');
    await expect(errors).toContainText('epsilon wine is also on row 5 of this file.');
    await expect(errors.getByRole('row').nth(1)).toContainText('2');                    // the row number as the spreadsheet shows it
    await expect(dialog.getByTestId('import-confirm')).toBeDisabled();
    // An item with the same name as one already here (and no SKU of its own) refuses the file too.
    await dialog.getByTestId('import-file').setInputFiles({ name: 'same-name.csv', mimeType: 'text/csv', buffer: csv('Name,Price', 'BETA JUICE,300') });
    await expect(errors).toContainText('An item called BETA JUICE already exists');

    // A good file (semicolons, a quoted name with a comma, other headings people use): checked, shown, then added.
    await dialog.getByTestId('import-file').setInputFiles({ name: 'good.csv', mimeType: 'text/csv', buffer: csv(
      'Item;Code;Category;Price;Cost;Qty',
      '"Gamma Cola, 50cl";GC-50;Soft drinks;500;350;48',
      'Delta Beer;DB-33;Beers;800;600;24',
      'Zeta Crisps;ZC-1;Snacks;200;120;') });
    const ready = dialog.getByTestId('import-ready');
    await expect(ready).toContainText('3 item(s) will be added');
    await expect(ready).toContainText('Soft drinks');
    await expect(ready).toContainText('Opening stock will be recorded for 2 item(s)');
    await expect(dialog.getByTestId('import-branch')).toBeVisible();
    await expect(dialog.getByTestId('import-preview')).toContainText('Gamma Cola, 50cl');
    await dialog.getByTestId('import-confirm').click();
    await expect(dialog.getByTestId('import-done')).toContainText('3 item(s) added');
    await dialog.getByTestId('import-close').click();
    await expect(page.getByTestId('item-Gamma Cola, 50cl')).toContainText('GC-50');
    await expect(page.getByTestId('item-Zeta Crisps')).toBeVisible();

    // The opening stock is on hand, and it is on the item's Activity tab as opening stock.
    await page.goto('/app/inventory');
    await expect(page.getByTestId('item-Delta Beer').getByTestId('on-hand')).toContainText('24');
    await expect(page.getByTestId('item-Zeta Crisps').getByTestId('on-hand')).toContainText('0');
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-edit-Delta Beer').click();
    await page.getByTestId('sc-tab-activity').click();
    await expect(page.getByTestId('activity-list')).toContainText('Opening stock');
    await expect(page.getByTestId('activity-list')).toContainText('+24');

    // The same file again is refused whole: every item is already here.
    await page.getByTestId('sc-close').click();
    await page.getByTestId('item-import').click();
    await dialog.getByTestId('import-file').setInputFiles({ name: 'again.csv', mimeType: 'text/csv', buffer: csv('Name,SKU', 'Delta Beer,DB-33') });
    await expect(dialog.getByTestId('import-errors')).toContainText('SKU DB-33 is already used by Delta Beer');
  });
});

test.describe('Purchase order: finding items and sharing', () => {
  test('an item is found whatever the letter case, and the order opens for its supplier from a private link without signing in', async ({ page, browser }) => {
    const who = await ownerInApp(page);
    await page.goto('/app/inventory/items');
    for (const [name, sku] of [['Woodford Reserve', 'WR-750'], ['Woodland Gin', 'WG-700']] as const) {
      await page.getByTestId('item-new').click();
      await page.getByTestId('item-name').fill(name);
      await page.getByTestId('item-sku').fill(sku);
      await page.getByTestId('item-save').click();
      await expect(page.getByTestId(`item-${name}`)).toBeVisible();
    }

    await page.goto('/app/purchasing/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('po-supplier-new').click();
    await page.getByTestId('supplier-name').fill('Highland Distillers');
    await page.getByTestId('supplier-email').fill('sales@highland.test');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('po-supplier-name')).toHaveText('Highland Distillers');

    // Part of a name in other letters lists everything like it; a part number in other letters adds the item.
    await page.getByTestId('po-scan').fill('WOOD');
    await expect(page.getByTestId('po-matches')).toContainText('Woodford Reserve');
    await expect(page.getByTestId('po-matches')).toContainText('Woodland Gin');
    await page.getByTestId('po-scan').fill('wr-750');
    await page.getByTestId('po-scan').press('Enter');
    await expect(page.getByTestId('po-lines')).toContainText('Woodford Reserve');
    await page.getByTestId('po-scan').fill('woodland g');
    await page.getByTestId('po-scan').press('Enter');
    await expect(page.getByTestId('po-lines')).toContainText('Woodland Gin');

    // Nothing to share until the order exists.
    await expect(page.getByTestId('po-share')).toBeDisabled();
    await page.getByTestId('po-save').click();
    await expect(page.getByTestId('po-number')).toContainText(/^PO-\d{4}-\d{5}$/);
    const number = (await page.getByTestId('po-number').innerText()).trim();

    await page.getByTestId('po-share').click();
    const share = page.getByTestId('share-links');
    await expect(share).toBeVisible();
    const link = (await share.getByTestId('share-qr').getAttribute('data-link'))!;
    expect(link).toMatch(/\/po\/[A-Za-z0-9_-]{20,}$/);
    await expect(share.getByTestId('share-qr').locator('svg')).toBeVisible();
    await expect(share.getByTestId('share-whatsapp')).toHaveAttribute('href', new RegExp('^https://wa\\.me/\\?text=.*' + encodeURIComponent(link).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(share.getByTestId('share-email')).toHaveAttribute('href', /^mailto:sales%40highland\.test\?subject=/);
    await expect(share.getByTestId('share-sms')).toHaveAttribute('href', /^sms:/);

    // The supplier: not signed in, sees this order as it prints, and nothing else.
    const supplier = await newContext(browser);
    await supplier.page.goto(link);
    const sheet = supplier.page.getByTestId('public-po');
    await expect(sheet).toContainText(number);
    await expect(sheet).toContainText(who.name);
    await expect(sheet.getByTestId('po-print-sheet')).toContainText('Woodford Reserve');
    await expect(sheet.getByTestId('po-print-sheet')).toContainText('Woodland Gin');
    await expect(supplier.page.getByTestId('public-po-print')).toBeVisible();
    await expect(supplier.page.getByTestId('main-nav')).toHaveCount(0);
    await expect(supplier.page).toHaveURL(/\/po\//);

    // A made-up link opens nothing, and the order's own screen still needs a sign-in.
    await supplier.page.goto('/po/this-is-not-a-real-link-0000000000');
    await expect(supplier.page.getByTestId('public-po-error')).toContainText('not valid');
    await supplier.page.goto(page.url());
    await expect(supplier.page).toHaveURL(/\/login/);
    await supplier.context.close();

    // The link stays the same for the order: asking again gives the same one.
    await page.reload();
    await page.getByTestId('po-share').click();
    await expect(page.getByTestId('share-qr')).toHaveAttribute('data-link', link);
  });
});

test.describe('Till and bar: typed quantities and collated marks', () => {
  test('a large quantity is typed, Void asks how many of what was sent, and only that many come off', async ({ page }) => {
    const who = await ownerInApp(page, { demo: true });
    await openPos(page);
    await expect(page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Party');
    await page.getByTestId('nb-create').click();
    await expect(page.getByTestId('current-bill')).toContainText('Party');

    // One tap, then the number is typed; plus and minus sit either side of the box.
    await page.getByTestId('product-Demo Canned Beans').click();
    const row = page.getByTestId('line-Demo Canned Beans');
    await expect(row.getByRole('button', { name: 'Fewer' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'More' })).toBeVisible();
    await typeQuantity(page, 'Demo Canned Beans', '3');
    await page.getByTestId('send-order').click();
    await waitForSync(page);
    await row.getByRole('button', { name: 'More' }).click();
    await row.getByRole('button', { name: 'More' }).click();
    await page.getByTestId('send-order').click();
    await waitForSync(page);
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('line-qty')).toHaveValue('5');

    // Sent twice, still one Void button; it asks how many.
    await expect(row.getByTestId('void-Demo Canned Beans')).toHaveCount(1);
    await row.getByTestId('void-Demo Canned Beans').click();
    const dialog = page.getByTestId('void-dialog');
    await expect(dialog).toContainText('of 5 sent');
    await expect(dialog.getByTestId('void-quantity')).toHaveValue('1');
    await dialog.getByTestId('void-reason').fill('Customer took fewer');
    await dialog.getByTestId('auth-mode-password').click();
    await dialog.getByTestId('auth-email').fill(who.email);
    await dialog.getByTestId('auth-password').fill(PASSWORD);
    await dialog.getByTestId('void-quantity').fill('9');
    await expect(dialog).toContainText('Between 1 and 5');
    await expect(dialog.getByTestId('void-confirm')).toBeDisabled();                    // more than was sent cannot be voided
    await dialog.getByTestId('void-quantity').fill('2');
    await dialog.getByTestId('void-confirm').click();
    await expect(dialog).toHaveCount(0);
    await waitForSync(page);
    await expect(row.getByTestId('line-qty')).toHaveValue('3');

    // Two came back to the shelf (48 at the start, 5 sent, 2 voided), and the void is in the history.
    await page.goto('/app/inventory');
    await expect(page.getByTestId('item-Demo Canned Beans 400g').getByTestId('on-hand')).toContainText('45');
    await page.goto('/app/pos/reports/void-history');
    await expect(page.getByTestId('report-table')).toContainText('Customer took fewer');
  });

  test('the bill shows one mark per bar state with its total, and the bar hands back only as many as it cannot make', async ({ page, browser }) => {
    test.slow();   // three signed-in devices
    const who = await ownerInApp(page, { type: 'Nightclub', barManMethod: true, demo: true });
    const waiterCode = await addPinStaff(page, 'Wale Waiter', 'waiter', '7391');
    const barmanCode = await addPinStaff(page, 'Bola Barman', 'bartender', '8264');

    const barman = await newContext(browser);
    await pinSignIn(barman.page, who.slug, barmanCode, '8264');
    await barman.page.goto('/app/pos/bar-orders');
    await expect(barman.page.getByTestId('bar-queue-empty')).toBeVisible();

    const waiter = await newContext(browser);
    const w = waiter.page;
    await pinSignIn(w, who.slug, waiterCode, '7391');
    await openPos(w);
    await expect(w.getByTestId('product-grid')).toContainText('Demo Canned Beans');
    await w.getByTestId('new-bill').click();
    await w.getByTestId('nb-kind').selectOption('Table');
    await w.getByTestId('nb-table').fill('4');
    await w.getByTestId('nb-create').click();
    await expect(w.getByTestId('current-bill')).toContainText('Table 4');
    await w.getByTestId('product-Demo Canned Beans').click();
    await typeQuantity(w, 'Demo Canned Beans', '3');
    await w.getByTestId('send-order').click();
    const marks = w.getByTestId('bar-state-Demo Canned Beans');
    await expect(marks).toHaveText('3 waiting at the bar');

    // Sent again: still one mark, with the total. Never "1 waiting at the bar" over and over.
    const row = w.getByTestId('line-Demo Canned Beans').first();
    await row.getByRole('button', { name: 'More' }).click();
    await row.getByRole('button', { name: 'More' }).click();
    await w.getByTestId('send-order').click();
    await expect(marks).toHaveCount(1);
    await expect(marks).toHaveText('5 waiting at the bar');
    await expect(marks).toHaveAttribute('data-quantity', '5');

    // The bar sees each order with one line per item and its total.
    const queue = barman.page.getByTestId('bar-queue');
    const first = queue.locator('[data-testid="bar-order-Table 4"]').filter({ has: barman.page.locator('[data-testid="bar-item-Demo Canned Beans"][data-quantity="3"]') });
    await expect(first).toHaveCount(1);
    await expect(first.getByTestId('bar-item-Demo Canned Beans')).toHaveCount(1);
    await expect(first.getByTestId('bar-items')).toContainText('3 x Demo Canned Beans');
    await first.getByTestId('bar-take').click();

    // Two states now, one mark each with its total.
    await expect(marks).toHaveCount(2);
    await expect(marks.filter({ hasText: 'waiting' })).toHaveText('2 waiting at the bar');
    await expect(marks.filter({ hasText: 'prepared' })).toHaveText('3 being prepared');

    // The bar can make two of the three: it types 1.
    const taken = queue.locator('[data-testid="bar-order-Table 4"][data-status="Taken"]');
    await taken.getByTestId('bar-cant').click();
    const cant = taken.getByTestId('bar-cant-qty-Demo Canned Beans');
    await expect(cant).toHaveValue('3');
    await cant.fill('7');
    await cant.blur();
    await expect(cant).toHaveValue('3');                                               // never more than was asked for
    await cant.fill('1');
    await cant.blur();
    await taken.getByTestId('bar-cant-reason-input').fill('Only two tins left');
    await taken.getByTestId('bar-cant-confirm').click();
    await expect(taken.locator('[data-testid="bar-item-Demo Canned Beans"][data-quantity="2"]')).toHaveCount(1);
    await expect(taken.locator('[data-testid="bar-item-Demo Canned Beans"][data-quantity="1"]')).toContainText("Can't make: Only two tins left");

    // The attendant is told, and the bill has the one handed back on a row of its own, with a quantity box, beside the rest.
    const told = w.getByTestId('bar-prompt-mine-Table 4').filter({ hasText: "can't make" });
    await expect(told).toContainText('Only two tins left');
    await told.getByTestId('bar-prompt-acknowledge').click();
    await expect(w.getByTestId('handed-back-Demo Canned Beans')).toContainText('Only two tins left');
    await expect(marks.filter({ hasText: 'prepared' })).toHaveText('2 being prepared');
    await expect(marks.filter({ hasText: 'waiting' })).toHaveText('2 waiting at the bar');
    await expect(marks.filter({ hasText: "can't make" })).toHaveCount(1);

    // The two that can be made go out as usual.
    await taken.getByTestId('bar-ready').click();
    await expect(marks.filter({ hasText: 'ready' })).toHaveText('2 ready to collect');

    await barman.context.close();
    await waiter.context.close();
  });
});

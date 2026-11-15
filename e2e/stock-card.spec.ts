import { Page, expect, test } from '@playwright/test';
import { PNG, registerViaUi } from './helpers';

/**
 * The Stock Card: the one card to add or change a stock item, opened from Add / Modify Stock and from "Add SKU" on a purchase order.
 * Its sale rules (special price, minimum price, tax exempt, no discount, whole units) are followed by the till and enforced by the server.
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

/** "yyyy-MM-ddTHH:mm" for a datetime-local box, a number of days from now. */
function localDateTime(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test.describe('Stock card', () => {
  test('an item is added with every part of the card, the markup follows the price both ways, and it is all still there when reopened', async ({ page }, testInfo) => {
    await ownerInApp(page);
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    const card = page.getByTestId('stock-card');
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: new item');
    // Save is never greyed out: pressed with nothing typed, it says what is missing and puts the cursor there.
    await expect(page.getByTestId('item-save')).toBeEnabled();
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-problems')).toContainText('Item details (name)');
    await expect(page.getByTestId('item-name')).toBeFocused();
    await expect(card).toBeVisible();
    // A tab that needs a saved item says the same instead of opening.
    await page.getByTestId('sc-tab-picture').click();
    await expect(page.getByTestId('item-problems')).toContainText('Item details (name)');
    await expect(page.getByTestId('no-picture')).toHaveCount(0);

    await page.getByTestId('item-sku').fill('PC-100');
    await page.getByTestId('item-name').fill('Phone charger');
    await page.getByTestId('item-description').fill('USB-C, 20 W');
    await page.getByTestId('item-barcode').fill('6009880123456');

    // Markup is one percentage on the last cost, and works both ways.
    await page.getByTestId('item-cost').fill('500');
    await page.getByTestId('item-price').fill('1000');
    await expect(page.getByTestId('markup-sellingPrice')).toHaveValue('100');
    await page.getByTestId('markup-tradePrice').fill('80');
    await expect(page.getByTestId('item-trade')).toHaveValue('900');
    await page.getByTestId('item-wholesale').fill('850');
    await page.getByTestId('item-reseller').fill('800');
    await page.getByTestId('item-bundle').fill('780');

    // A special needs its period; a floor above the special is refused by the server and shown on the card.
    await page.getByTestId('item-special').fill('750');
    await page.getByTestId('item-minimum-price').fill('760');
    await page.getByTestId('item-special-from').fill(localDateTime(-1));
    await page.getByTestId('item-special-to').fill(localDateTime(1));
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('error-minimumPrice')).toContainText('above the special price');
    await expect(page.getByTestId('item-problems')).toContainText('Minimum price');       // and it is listed by the Save button, in words
    await page.getByTestId('item-minimum-price').fill('700');

    await page.getByTestId('item-block-fractions').check();
    await page.getByTestId('item-block-discount').check();
    await page.getByTestId('item-tax').selectOption('exempt');
    await page.getByTestId('item-points').fill('5');
    await page.getByTestId('item-sales-ac').selectOption({ label: '4000 Sales' });      // accounts come from the ledger's list now
    await page.getByTestId('item-purchase-ac').selectOption({ label: '1200 Stock' });
    await page.getByTestId('item-srp').fill('1200');
    await page.getByTestId('item-prompt').fill('Offer the cable too');
    await page.getByTestId('item-notes').fill('Shelf B2');
    await page.getByTestId('item-save').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('item-Phone charger')).toContainText('PC-100');
    // The card has closed and a small box offers the next step; Done puts it away.
    await expect(page.getByTestId('item-saved-name')).toHaveText('Phone charger');
    await page.getByTestId('item-saved-done').click();
    await expect(page.getByTestId('item-saved-prompt')).toHaveCount(0);

    // Reopened: everything typed is there, the figures are live, and the special is running.
    await page.getByTestId('item-edit-Phone charger').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: Phone charger');
    await expect(page.getByTestId('item-reseller')).toHaveValue('800');
    await expect(page.getByTestId('item-bundle')).toHaveValue('780');
    await expect(page.getByTestId('item-special')).toHaveValue('750');
    await expect(page.getByTestId('item-minimum-price')).toHaveValue('700');
    await expect(page.getByTestId('item-cost')).toHaveValue('500');
    await expect(page.getByTestId('markup-specialPrice')).toHaveValue('50');
    await expect(page.getByTestId('item-block-fractions')).toBeChecked();
    await expect(page.getByTestId('item-block-discount')).toBeChecked();
    await expect(page.getByTestId('item-edit-qty')).toHaveCount(0);                      // every item has a quantity box at the till now
    await expect(page.getByTestId('item-tax')).toHaveValue('exempt');
    await expect(page.getByTestId('item-points')).toHaveValue('5');
    await expect(page.getByTestId('item-sales-ac').locator('option:checked')).toHaveText('4000 Sales');
    await expect(page.getByTestId('item-prompt')).toHaveValue('Offer the cable too');
    await expect(page.getByTestId('item-notes')).toHaveValue('Shelf B2');
    await expect(page.getByTestId('special-live')).toBeVisible();
    await expect(page.getByTestId('fig-on-hand')).toHaveText('0');
    await expect(page.getByTestId('fig-last-sold')).toHaveText('Never');
    await expect(page.getByTestId('fig-layby')).toHaveText('0');                         // layby, back orders and consignment are live figures now
    await expect(page.getByTestId('fig-back-orders')).toHaveText('0');
    await expect(page.getByTestId('fig-consignment')).toHaveText('0');

    // The picture: uploaded, shown, removed.
    await page.getByTestId('sc-tab-picture').click();
    await expect(page.getByTestId('no-picture')).toBeVisible();
    await page.getByTestId('picture-file').setInputFiles({ name: 'charger.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('item-picture')).toBeVisible();
    await page.getByTestId('picture-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await expect(page.getByTestId('picture-error')).toContainText('PNG, JPEG or WebP');

    // Activity replaces History, Sales and Purchases: what has moved, and links to the full reports.
    await expect(page.getByTestId('sc-tab-history')).toHaveCount(0);
    await expect(page.getByTestId('sc-tab-sales')).toHaveCount(0);
    await expect(page.getByTestId('sc-tab-purchases')).toHaveCount(0);
    await page.getByTestId('sc-tab-activity').click();
    await expect(page.getByTestId('activity-list')).toContainText('Nothing has moved yet');
    await expect(page.getByTestId('link-history')).toBeVisible();
    await expect(page.getByTestId('link-sales')).toBeVisible();
    await expect(page.getByTestId('link-purchases')).toBeVisible();

    // Other part numbers still work from their tab.
    await page.getByTestId('sc-tab-aliases').click();
    await page.getByTestId('alias-code').fill('ALT-PC-100');
    await page.getByTestId('alias-add').click();
    await expect(page.getByTestId('alias-list')).toContainText('ALT-PC-100');

    // Phone width, dark: the card scrolls inside itself and the page does not scroll sideways.
    await page.getByTestId('sc-tab-details').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.getByTestId('item-name')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('stock-card-phone-dark.png') });
    await page.setViewportSize({ width: 1280, height: 720 });

    // Deactivate instead of delete: the item leaves the active list and keeps its history.
    await page.getByTestId('sc-deactivate').click();
    await expect(page.getByTestId('stock-card')).toHaveCount(0);
    await expect(page.getByTestId('item-Phone charger')).toHaveCount(0);
  });

  test('Add SKU on a purchase order opens the card for a new item and puts the saved item on the order', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/purchasing/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('po-supplier-new').click();
    await page.getByTestId('supplier-name').fill('Highland Distillers');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('po-supplier-name')).toHaveText('Highland Distillers');

    // A name typed in the scan box that matches nothing: the note points at Add SKU, and the card opens with the name carried over.
    await page.getByTestId('po-scan').fill('Glenfiddich 12');
    await page.getByTestId('po-scan').press('Enter');
    await expect(page.getByTestId('po-scan-note')).toContainText('press Add SKU');
    await page.getByTestId('po-add-sku').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: new item');
    await expect(page.getByTestId('item-name')).toHaveValue('Glenfiddich 12');
    await page.getByTestId('item-sku').fill('GF-12');
    await page.getByTestId('item-cost').fill('9000');
    await page.getByTestId('item-price').fill('15000');
    await page.getByTestId('item-save').click();

    // Saved: the card closes and the new item is a line on the document, at the cost just typed.
    await expect(page.getByTestId('stock-card')).toHaveCount(0);
    const lines = page.getByTestId('po-lines');
    await expect(lines).toContainText('Glenfiddich 12');
    await expect(lines).toContainText('GF-12');

    // A scanned barcode (digits) is carried into the barcode box instead; with the box empty the card simply opens blank.
    await page.getByTestId('po-scan').fill('5000281000011');
    await page.getByTestId('po-add-sku').click();
    await expect(page.getByTestId('item-barcode')).toHaveValue('5000281000011');
    await expect(page.getByTestId('item-name')).toHaveValue('');
    await page.getByTestId('sc-close').click();
    await page.getByTestId('po-scan').fill('');
    await page.getByTestId('po-add-sku').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: new item');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stock-card')).toHaveCount(0);

    // The item now exists for everyone: typing its part number and pressing Enter finds it.
    await page.getByTestId('po-scan').fill('GF-12');
    await page.getByTestId('po-scan').press('Enter');
    await expect(page.getByTestId('po-scan-note')).toContainText('already on the document');
  });

  test('the till sells at the special price, shows what is tax free, and refuses what the card forbids', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/settings/operations');
    await page.getByTestId('tax-name').fill('VAT');
    await page.getByTestId('tax-rate').fill('10');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');

    await page.goto('/app/inventory/items');
    // Bread: tax exempt, on special at 800 (normally 1,000), no discount allowed.
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Bread');
    await page.getByTestId('item-price').fill('1000');
    await page.getByTestId('item-special').fill('800');
    await page.getByTestId('item-special-from').fill(localDateTime(-1));
    await page.getByTestId('item-special-to').fill(localDateTime(1));
    await page.getByTestId('item-tax').selectOption('exempt');
    await page.getByTestId('item-block-discount').check();
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Bread')).toBeVisible();
    // Gift card: an ordinary item.
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Gift card');
    await page.getByTestId('item-price').fill('500');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Gift card')).toBeVisible();

    await page.goto('/app/pos');
    await expect(page.getByTestId('product-Bread')).toContainText('800.00');           // the tile shows what will be charged
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Rules');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Bread').click();
    await page.getByTestId('product-Gift card').click();
    await expect(page.getByTestId('special-Bread')).toBeVisible();
    await expect(page.getByTestId('exempt-Bread')).toBeVisible();
    // 800 (no tax) + 500 + 10% of 500 = 1,350.00
    await expect(page.getByTestId('bill-total')).toContainText('1,350.00');
    await expect(page.getByTestId('line-Gift card').getByTestId('line-qty')).toHaveValue('1');               // every item has its quantity box
    await expect(page.getByTestId('line-Gift card').getByRole('button', { name: 'More' })).toBeVisible();
    await expect(page.getByTestId('line-Bread').getByRole('button', { name: 'More' })).toBeVisible();
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('bill-total')).toContainText('1,350.00');             // the server agrees with the till's own sum
  });

  test('selling units are set on the Unit of measure tab and the till sells a case at the price times what it holds', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Lager');
    await page.getByTestId('item-barcode').fill('6001000000017');
    await page.getByTestId('item-price').fill('1000');
    await page.getByTestId('item-tax').selectOption('exempt');
    // Units need a saved item: the tab saves the new item by itself and opens, with the card still on screen.
    await page.getByTestId('sc-tab-units').click();
    await expect(page.getByTestId('stock-card-title')).toHaveText('Stock card: Lager');
    await expect(page.getByTestId('item-saved-prompt')).toHaveCount(0);
    await expect(page.getByTestId('unit-list')).toContainText('Sold singly only.');
    await expect(page.getByTestId('unit-add')).toBeDisabled();
    await page.getByTestId('unit-name').fill('Case');
    await page.getByTestId('unit-size').fill('12');
    await page.getByTestId('unit-barcode').fill('6001000000024');
    await page.getByTestId('unit-add').click();
    await expect(page.getByTestId('unit-row-Case')).toContainText('12,000.00');          // 12 x 1,000
    await page.getByTestId('unit-name').fill('Half case');
    await page.getByTestId('unit-size').fill('6');
    await page.getByTestId('unit-add').click();
    await expect(page.getByTestId('unit-row-Half case')).toContainText('6,000.00');
    // The server refuses a second unit with the same name, and one that holds a single.
    await page.getByTestId('unit-name').fill('case');
    await page.getByTestId('unit-size').fill('10');
    await page.getByTestId('unit-add').click();
    await expect(page.getByTestId('unit-error')).toBeVisible();
    await page.getByTestId('unit-name').fill('Tray');
    await page.getByTestId('unit-size').fill('24');
    await page.getByTestId('unit-add').click();
    await expect(page.getByTestId('unit-row-Tray')).toBeVisible();
    await page.getByTestId('unit-remove-Tray').click();
    await expect(page.getByTestId('unit-row-Tray')).toHaveCount(0);
    await page.getByTestId('sc-tab-details').click();
    await expect(page.getByTestId('fig-on-hand')).toHaveText('0');                       // adding units added no stock
    await page.getByTestId('sc-close').click();

    // The till asks how it is sold.
    await page.goto('/app/pos');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Cases');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Lager').click();
    await expect(page.getByTestId('unit-single')).toContainText('1,000.00');
    await expect(page.getByTestId('unit-Half case')).toContainText('6,000.00');
    await page.getByTestId('unit-Case').click();
    await expect(page.getByTestId('line-Lager (Case of 12)')).toContainText('12,000.00');
    await page.getByTestId('product-Lager').click();
    await page.getByTestId('unit-single').click();
    await expect(page.getByTestId('bill-total')).toContainText('13,000.00');

    // The barcode on the case sells a case without asking; the item's own barcode still asks.
    await page.getByTestId('barcode').fill('6001000000024');
    await page.getByTestId('barcode').press('Enter');
    await expect(page.getByTestId('unit-choices')).toHaveCount(0);
    await expect(page.getByTestId('bill-total')).toContainText('25,000.00');
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('bill-total')).toContainText('25,000.00');             // the server agrees
  });

  test('a package is built on the Package content tab and the till sells it for the total of its contents, taxing only the taxable part', async ({ page }) => {
    await ownerInApp(page);
    await page.goto('/app/settings/operations');
    await page.getByTestId('tax-name').fill('VAT');
    await page.getByTestId('tax-rate').fill('10');
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-msg')).toHaveText('Saved.');

    await page.goto('/app/inventory/items');
    for (const [name, price, exempt] of [['Wine', '3000', false], ['Chocolate', '500', true], ['Ribbon', '', false], ['Gift hamper', '', false]] as const) {
      await page.getByTestId('item-new').click();
      await page.getByTestId('item-name').fill(name);
      if (price) await page.getByTestId('item-price').fill(price);
      if (exempt) await page.getByTestId('item-tax').selectOption('exempt');
      await page.getByTestId('item-save').click();
      await expect(page.getByTestId('item-' + name)).toBeVisible();
    }

    await page.getByTestId('item-edit-Gift hamper').click();
    await page.getByTestId('sc-tab-package').click();
    await expect(page.getByTestId('pkg-list')).toContainText('Not a package');
    await expect(page.getByTestId('pkg-save')).toBeDisabled();
    await page.getByTestId('pkg-search').fill('Wine');
    await page.getByTestId('pkg-result-Wine').click();
    await page.getByTestId('pkg-search').fill('Choc');
    await page.getByTestId('pkg-result-Chocolate').click();
    await page.getByTestId('pkg-qty-Chocolate').fill('2');
    await expect(page.getByTestId('pkg-total')).toHaveText('4,000.00');                  // 3,000 + 2 x 500

    // An item with no selling price cannot go in: the server says so and nothing is saved.
    await page.getByTestId('pkg-search').fill('Ribbon');
    await page.getByTestId('pkg-result-Ribbon').click();
    await page.getByTestId('pkg-save').click();
    await expect(page.getByTestId('pkg-error')).toContainText('no selling price');
    await page.getByTestId('pkg-remove-Ribbon').click();
    await page.getByTestId('pkg-save').click();
    await expect(page.getByTestId('pkg-msg')).toHaveText('Package content saved.');
    await expect(page.getByTestId('pkg-row-Chocolate')).toContainText('no tax');
    await page.getByTestId('sc-tab-details').click();
    await expect(page.getByTestId('package-note')).toBeVisible();
    await expect(page.getByTestId('item-price')).toHaveValue('4000');
    await page.getByTestId('sc-close').click();

    // The till: one line, its contents under it, tax on the wine only.
    await page.goto('/app/pos');
    await expect(page.getByTestId('product-Gift hamper')).toContainText('4,000.00');
    await page.getByTestId('new-bill').click();
    await page.getByTestId('nb-label').fill('Hamper');
    await page.getByTestId('nb-create').click();
    await page.getByTestId('product-Gift hamper').click();
    await expect(page.getByTestId('contents-Gift hamper')).toContainText('1 x Wine');
    await expect(page.getByTestId('contents-Gift hamper')).toContainText('2 x Chocolate');
    await expect(page.getByTestId('part-exempt-Gift hamper')).toBeVisible();
    await expect(page.getByTestId('bill-total')).toContainText('4,300.00');             // 4,000 + 10% of the wine's 3,000
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('bill-total')).toContainText('4,300.00');             // the server agrees with the till's own sum
    await expect(page.getByTestId('contents-Gift hamper')).toContainText('2 x Chocolate');
  });
});

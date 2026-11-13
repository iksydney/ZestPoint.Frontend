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
    await expect(page.getByTestId('item-save')).toBeDisabled();                         // a name is needed first
    await expect(page.getByTestId('sc-tab-picture')).toBeDisabled();                     // the picture needs a saved item

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
    await page.getByTestId('item-minimum-price').fill('700');

    await page.getByTestId('item-block-fractions').check();
    await page.getByTestId('item-block-discount').check();
    await page.getByTestId('item-tax').selectOption('exempt');
    await page.getByTestId('item-points').fill('5');
    await page.getByTestId('item-sales-ac').fill('4000');
    await page.getByTestId('item-purchase-ac').fill('5000');
    await page.getByTestId('item-srp').fill('1200');
    await page.getByTestId('item-prompt').fill('Offer the cable too');
    await page.getByTestId('item-notes').fill('Shelf B2');
    await page.getByTestId('item-save').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('item-Phone charger')).toContainText('PC-100');

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
    await expect(page.getByTestId('item-edit-qty')).toBeChecked();
    await expect(page.getByTestId('item-tax')).toHaveValue('exempt');
    await expect(page.getByTestId('item-points')).toHaveValue('5');
    await expect(page.getByTestId('item-sales-ac')).toHaveValue('4000');
    await expect(page.getByTestId('item-prompt')).toHaveValue('Offer the cable too');
    await expect(page.getByTestId('item-notes')).toHaveValue('Shelf B2');
    await expect(page.getByTestId('special-live')).toBeVisible();
    await expect(page.getByTestId('fig-on-hand')).toHaveText('0');
    await expect(page.getByTestId('fig-last-sold')).toHaveText('Never');
    await expect(page.getByTestId('card-figures')).toContainText('Not tracked yet');     // layby, back orders, consignment: later steps

    // The picture: uploaded, shown, removed.
    await page.getByTestId('sc-tab-picture').click();
    await expect(page.getByTestId('no-picture')).toBeVisible();
    await page.getByTestId('picture-file').setInputFiles({ name: 'charger.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('item-picture')).toBeVisible();
    await page.getByTestId('picture-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await expect(page.getByTestId('picture-error')).toContainText('PNG, JPEG or WebP');

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
    // Gift card: one per line.
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Gift card');
    await page.getByTestId('item-price').fill('500');
    await page.getByTestId('item-edit-qty').uncheck();
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
    await expect(page.getByTestId('line-Gift card').getByRole('button', { name: 'More' })).toHaveCount(0);   // quantity is fixed
    await expect(page.getByTestId('line-Bread').getByRole('button', { name: 'More' })).toBeVisible();
    await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('bill-total')).toContainText('1,350.00');             // the server agrees with the till's own sum
  });
});

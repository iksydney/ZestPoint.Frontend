import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * Owner's decision of 2026-11-17: the company's admin sets printers up once, on the server, for its phones to print to (receipts, reports, labels). The server
 * keeps and checks the list; a phone connects to the printer.
 */

async function ownerInApp(page: Page) {
  const who = await registerViaUi(page, { type: 'Bar' });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function openPrinters(page: Page) {
  await page.locator('[data-nav="setup.admin"]').click();
  await page.locator('[data-testid="hub-list"] [data-nav="pos.printers"]').click();
  await expect(page.getByTestId('printers')).toBeVisible();
}

test.describe('Printers', () => {
  test('an admin adds each kind of printer, the server checks the settings, and a printer is switched off, never deleted', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await openPrinters(page);
    await expect(page.getByTestId('printers-none')).toBeVisible();

    // A name is needed; then the server's own words for an address that is missing or is not one.
    await page.getByTestId('printer-new').click();
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-name-error')).toContainText('name');
    await page.getByTestId('printer-name').fill('Counter');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-host-error')).toContainText('address');
    await page.getByTestId('printer-host').fill('http://192.168.1.50');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-host-error')).toContainText('Leave out http://');

    // A network printer: the port is 9100 unless given; the list says where it is, how it is reached and what it is for.
    await page.getByTestId('printer-host').fill('192.168.1.50');
    await page.getByTestId('printer-paper').selectOption({ label: '80 mm (wide)' });
    await page.getByTestId('printer-purpose-Reports').check();
    await page.getByTestId('printer-save').click();
    const counter = page.getByTestId('printer-row-Counter');
    await expect(counter).toContainText('192.168.1.50:9100');
    await expect(counter).toContainText('ESC/POS');
    await expect(counter).toContainText('80 mm');
    await expect(counter).toContainText('Receipts, Reports');
    await expect(counter).toContainText('In use');

    // The same name is refused in other letters.
    await page.getByTestId('printer-new').click();
    await page.getByTestId('printer-name').fill('counter');
    await page.getByTestId('printer-host').fill('192.168.1.51');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-name-error')).toContainText('Already used');
    await page.getByTestId('printer-form').getByRole('button', { name: 'Cancel' }).click();

    // A Bluetooth printer has no address, only the name to look for; a handheld's own printer is Sunmi's and speaks ESC/POS.
    await page.getByTestId('printer-new').click();
    await page.getByTestId('printer-name').fill('Waiter printer');
    await page.getByTestId('printer-kind').selectOption('Bluetooth');
    await expect(page.getByTestId('printer-host')).toHaveCount(0);
    await page.getByTestId('printer-device').fill('BT-58-01');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-row-Waiter printer')).toContainText('Bluetooth: BT-58-01');
    await expect(page.getByTestId('printer-row-Waiter printer')).toContainText('58 mm');

    await page.getByTestId('printer-new').click();
    await page.getByTestId('printer-name').fill('Sunmi V2');
    await page.getByTestId('printer-kind').selectOption('Handheld');
    await expect(page.getByTestId('printer-language')).toBeDisabled();
    await expect(page.getByTestId('printer-make')).toHaveValue('Sunmi');
    await expect(page.getByTestId('printer-purpose-Labels')).toBeVisible();
    await page.getByTestId('printer-purpose-Labels').check();                              // a handheld's printer prints no labels: the server says so
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-purposes-error')).toContainText('does not print labels');
    await page.getByTestId('printer-purpose-Labels').uncheck();
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-row-Sunmi V2')).toContainText('Handheld (Sunmi)');

    // A label printer: only for labels, and TSPL needs the size of a label.
    await page.getByTestId('printer-new').click();
    await page.getByTestId('printer-name').fill('Shelf labels');
    await page.getByTestId('printer-host').fill('10.0.0.7');
    await page.getByTestId('printer-language').selectOption('Tspl');
    await page.getByTestId('printer-purpose-Receipts').uncheck();
    await page.getByTestId('printer-purpose-Labels').check();
    await expect(page.getByTestId('printer-paper')).toHaveAttribute('type', 'number');     // a label's width, not 58 or 80
    await page.getByTestId('printer-paper').fill('40');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-label-height-error')).toContainText('height');
    await page.getByTestId('printer-label-height').fill('30');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-row-Shelf labels')).toContainText('40 x 30 mm label');
    await expect(page.getByTestId('printer-row-Shelf labels')).toContainText('TSPL');

    // Switched off: it stays in the list, and is changed with Edit.
    await page.getByTestId('printer-edit-Waiter printer').click();
    await page.getByTestId('printer-active').uncheck();
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-row-Waiter printer')).toContainText('Switched off');
    await page.getByTestId('printer-edit-Counter').click();
    await expect(page.getByTestId('printer-host')).toHaveValue('192.168.1.50');
    await page.getByTestId('printer-host').fill('192.168.1.60');
    await page.getByTestId('printer-port').fill('9101');
    await page.getByTestId('printer-save').click();
    await expect(page.getByTestId('printer-row-Counter')).toContainText('192.168.1.60:9101');
    await expect(page.getByTestId('printer-list').locator('tbody tr')).toHaveCount(4);
  });
});

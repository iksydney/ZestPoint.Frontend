import { expect, test } from '@playwright/test';
import { newContext, registerViaUi, openPos } from './helpers';

/**
 * Table ordering (enterprise programme, piece 11): the company puts items on the customer menu, prints a table's QR sticker, and a customer who scans it (no sign-in) orders with an
 * option; the till shows the request, a waiter changes and accepts it onto the table's bill, a call for a waiter reaches the till, a second customer's order is declined with a reason, and
 * a new code makes the old sticker stop working.
 */
test.describe('Table ordering', () => {
  test('a customer orders from the QR code, staff accept or decline it at the till, calls are answered, and a new code kills the old sticker', async ({ page, browser }) => {
    test.slow();
    await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);

    // Mojito (with an option) is on the customer menu; Soap is sold at the till only.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Mojito');
    await page.getByTestId('item-price').fill('2000');
    await page.getByTestId('item-customer-menu').check();
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Mojito')).toBeVisible();
    await page.getByTestId('item-edit-Mojito').click();
    await page.getByTestId('sc-tab-recipe').click();
    const tab = page.getByTestId('recipe-tab');
    await tab.getByTestId('add-modifier').click();
    await tab.getByTestId('mod-name-0').fill('Double');
    await tab.getByTestId('mod-price-0').fill('500');
    await tab.getByTestId('save-options').click();
    await expect(tab.getByTestId('options-msg')).toHaveText('Options saved.');
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-new').click();
    await page.getByTestId('item-name').fill('Soap');
    await page.getByTestId('item-price').fill('700');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId('item-Soap')).toBeVisible();

    // Table T7 and its sticker: the QR code and the link it opens.
    await page.goto('/app/settings/tables');
    await page.getByTestId('table-new').click();
    await page.getByTestId('table-name').fill('T7');
    await page.getByTestId('table-save').click();
    await expect(page.getByTestId('table-row-T7')).toBeVisible();
    await page.getByTestId('table-qr-T7').click();
    await expect(page.getByTestId('table-qr-image').locator('svg')).toBeVisible();
    const path = new URL((await page.getByTestId('table-qr-link').innerText()).trim()).pathname;
    expect(path).toMatch(/^\/t\/[A-Za-z0-9_-]{40,}$/);
    await page.keyboard.press('Escape');

    // The customer: the menu with the company's name, only what is on the customer menu, an option, a name, and Send.
    const guest = await newContext(browser);
    await guest.page.goto(path);
    await expect(guest.page.getByTestId('tp-table')).toContainText('Table T7');
    await expect(guest.page.getByTestId('tp-item-Mojito')).toBeVisible();
    await expect(guest.page.getByTestId('tp-item-Soap')).toHaveCount(0);
    await guest.page.getByTestId('tp-add-Mojito').click();
    await guest.page.getByTestId('tp-option-Double').check();
    await guest.page.getByTestId('tp-options-add').click();
    await expect(guest.page.getByTestId('tp-basket-count')).toHaveText('1');
    await guest.page.getByTestId('tp-review').click();
    await guest.page.getByTestId('tp-name').fill('Ada');
    await guest.page.getByTestId('tp-send').click();
    await expect(guest.page.getByTestId('tp-state')).toContainText('Waiting for staff to confirm');

    // The till: a count on the button, the request with its option, the waiter makes it two, and accepts it onto the table's bill.
    await openPos(page);
    await expect(page.getByTestId('table-requests-count')).toHaveText('1', { timeout: 25_000 });
    await page.getByTestId('table-requests-btn').click();
    await expect(page.getByTestId('tr-1')).toContainText('Table T7');
    await expect(page.getByTestId('tr-1')).toContainText('Double');
    await page.getByRole('button', { name: 'More Mojito' }).click();
    await expect(page.getByTestId('tr-qty-1-Mojito')).toHaveText('2');
    await page.getByTestId('tr-accept-1').click();
    await expect(page.getByTestId('line-Mojito')).toBeVisible({ timeout: 15_000 });               // the bill is open, with the items as lines still to send
    await expect(page.getByTestId('table-requests-count')).toHaveCount(0);

    // The customer sees it confirmed, with what is on the bill.
    await expect(guest.page.getByTestId('tp-state')).toContainText('Confirmed', { timeout: 25_000 });
    await expect(guest.page.getByTestId('tp-bill')).toContainText('Mojito');

    // A call for a waiter reaches the till and is marked done; the customer is told.
    await guest.page.getByTestId('tp-call-waiter').click();
    await expect(guest.page.getByTestId('tp-call-note')).toContainText('need a waiter');
    await expect(page.getByTestId('table-requests-count')).toHaveText('1', { timeout: 25_000 });
    await page.getByTestId('table-requests-btn').click();
    await expect(page.getByTestId('tr-what-2')).toContainText('asking for a waiter');
    await page.getByTestId('tr-done-2').click();
    await expect(page.getByTestId('tr-none')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guest.page.getByTestId('tp-state')).toContainText('Done', { timeout: 25_000 });

    // Another customer's order is declined, with a reason that customer is shown.
    const other = await newContext(browser);
    await other.page.goto(path);
    await other.page.getByTestId('tp-add-Mojito').click();
    await other.page.getByTestId('tp-options-add').click();
    await other.page.getByTestId('tp-send').click();
    await expect(other.page.getByTestId('tp-state')).toContainText('Waiting');
    await expect(page.getByTestId('table-requests-count')).toHaveText('1', { timeout: 25_000 });
    await page.getByTestId('table-requests-btn').click();
    await page.getByTestId('tr-decline-3').click();
    await page.getByTestId('tr-reason-3').fill('We have run out of mint');
    await page.getByTestId('tr-decline-confirm-3').click();
    await expect(other.page.getByTestId('tp-state')).toContainText('could not be done', { timeout: 25_000 });
    await expect(other.page.getByTestId('tp-decline')).toHaveText('We have run out of mint');
    await page.keyboard.press('Escape');

    // A new code: the old sticker shows nothing any more.
    await page.goto('/app/settings/tables');
    await page.getByTestId('table-qr-T7').click();
    await page.getByTestId('table-qr-new').click();
    await page.getByTestId('table-qr-new-confirm').click();
    await expect.poll(async () => new URL((await page.getByTestId('table-qr-link').innerText()).trim()).pathname).not.toBe(path);
    await other.page.reload();
    await expect(other.page.getByTestId('tp-error')).toContainText('not valid');
  });
});

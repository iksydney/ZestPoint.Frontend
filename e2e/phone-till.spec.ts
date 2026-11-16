import { expect, test } from '@playwright/test';
import { TOURS } from '../src/app/core/tour/tours';
import { addItem, fits, newBill, ownerInApp } from './phone-helpers';

/**
 * The till on a phone (enterprise programme, piece 13): products first, the bill as a panel that slides up from one bar, big buttons, and the pay box filling
 * the screen. A wide screen keeps the three panels it always had.
 */

test.describe('The till on a phone', () => {
  test('products come first, the bill slides up from one bar, and the pay box fills the screen', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await addItem(page, 'Tea', '700');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/pos');

    // No bill yet: the bar offers to start one, and the bill panel is not on screen.
    await expect(page.getByTestId('bill-bar')).toBeVisible();
    await expect(page.getByTestId('bill-bar-new')).toBeVisible();
    await expect(page.getByTestId('current-bill')).toBeHidden();
    await page.getByTestId('bill-bar-new').click();
    await newBill(page, 'Phone');
    await expect(page.getByTestId('bill-bar-open')).toContainText('Phone');

    // The open bills are one strip, not a tall list pushing the products down.
    const strip = await page.getByTestId('bill-list').boundingBox();
    expect(strip!.height).toBeLessThan(120);
    await expect(page.getByTestId('product-Tea')).toBeInViewport();

    await page.getByTestId('product-Tea').click();
    await expect(page.getByTestId('bill-bar-open')).toContainText('1 item(s)');
    await expect(page.getByTestId('bill-bar-total')).toContainText('700.00');
    await expect(page.getByTestId('current-bill')).toBeHidden();                     // adding items does not throw the panel over the products
    await fits(page, 'the till with its bar');

    // The panel: the bill, the totals, big buttons. It closes with its button and by tapping outside it.
    await page.getByTestId('bill-bar-open').click();
    await expect(page.getByTestId('current-bill')).toBeVisible();
    await expect(page.getByTestId('line-Tea')).toBeVisible();
    const pay = await page.getByTestId('pay').boundingBox();
    expect(pay!.height, 'a button a thumb can hit').toBeGreaterThanOrEqual(48);
    const more = await page.getByRole('button', { name: 'More' }).boundingBox();
    expect(more!.width).toBeGreaterThanOrEqual(44);
    await fits(page, 'the open bill panel');
    await page.getByTestId('bill-sheet-close').click();
    await expect(page.getByTestId('current-bill')).toBeHidden();
    await page.getByTestId('bill-bar-open').click();
    await expect(page.getByTestId('current-bill')).toBeVisible();
    await page.getByTestId('bill-backdrop').click({ position: { x: 20, y: 20 } });
    await expect(page.getByTestId('current-bill')).toBeHidden();

    // The pay box is the whole screen, and a sale still goes through.
    await page.getByTestId('bill-bar-open').click();
    await page.getByTestId('pay').click();
    await expect(page.getByTestId('pay-confirm')).toBeVisible();
    const box = await page.getByRole('dialog', { name: 'Take payment' }).boundingBox();
    expect(box!.x).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThanOrEqual(389);
    expect(box!.height).toBeGreaterThanOrEqual(843);
    await fits(page, 'the pay box');
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');

    // The smallest phone still in use.
    await page.setViewportSize({ width: 320, height: 568 });
    await fits(page, 'the till at 320px');
  });

  test('a wide screen keeps the three panels and has no bar', async ({ page }) => {
    await ownerInApp(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/app/pos');
    await expect(page.getByTestId('current-bill')).toBeVisible();                    // there before any bill is chosen, as it always was
    await expect(page.getByTestId('bill-bar')).toBeHidden();
    await expect(page.getByTestId('bill-sheet-close')).toBeHidden();
    await expect(page.getByTestId('bill-list')).toBeVisible();
  });

  test('the camera is offered at the till, and when it cannot start the typed code still adds the product', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await addItem(page, 'Tea', '700', '4006381333931');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/pos');
    await page.getByTestId('bill-bar-new').click();
    await newBill(page, 'Scan');

    // No camera is allowed in this test browser: the screen says so in words and the typing box works.
    await page.getByTestId('scan-camera').click();
    await expect(page.getByTestId('scanner')).toBeVisible();
    await expect(page.getByTestId('scanner-problem')).toBeVisible();
    const dialog = await page.getByRole('dialog', { name: 'Scan products' }).boundingBox();
    expect(dialog!.width).toBeGreaterThanOrEqual(389);                                // fills a phone
    await page.getByTestId('scanner-manual').fill('4006381333931');
    await page.getByTestId('scanner-use').click();
    await expect(page.getByTestId('scanner-feedback')).toContainText('OK: Tea');
    await page.getByTestId('scanner-manual').fill('9999999999994');
    await page.getByTestId('scanner-use').click();
    await expect(page.getByTestId('scanner-feedback')).toContainText('No product has the barcode 9999999999994');
    await page.getByTestId('scanner-done').click();
    await expect(page.getByTestId('scanner')).toHaveCount(0);
    await expect(page.getByTestId('bill-bar-open')).toContainText('1 item(s)');
  });

  test('the till tour opens the bill panel for the steps that point at the bill', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/pos');
    await expect(page.getByTestId('bill-bar')).toBeVisible();
    await page.getByTestId('help-open').click();
    await page.getByTestId('help-tour-screen').click();

    const tour = TOURS.find((t) => t.key === 'pos')!;
    const host = page.getByTestId('tour');
    await expect(host).toBeVisible();
    const shown: string[] = [];
    for (let guard = 0; guard < tour.steps.length + 2; guard++) {
      await expect(page.getByTestId('tour-title')).toBeVisible();
      const id = (await host.getAttribute('data-tour-step'))!;
      shown.push(id);
      expect(await host.getAttribute('data-tour-missing'), `${id}: a step points at something that is not on screen on a phone`).toBe('');
      const last = (await page.getByTestId('tour-next').innerText()).trim() === 'Done';
      await page.getByTestId('tour-next').click();
      if (last) break;
      await expect(host).not.toHaveAttribute('data-tour-step', id);
    }
    expect(shown).toEqual(tour.steps.map((s) => s.id));                               // every step was shown, the ones about the bill included
  });
});

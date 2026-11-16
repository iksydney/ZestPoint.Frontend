import { expect, test } from '@playwright/test';
import { addItem, fits, ownerInApp, startCount, stockUp } from './phone-helpers';

/**
 * Counting stock on a phone (enterprise programme, piece 13): one item at a time with a big number pad, jumping to an item by its barcode, and the table kept
 * for a wide screen. The expected quantities stay hidden on a blind count, as before.
 */

test.describe('Stock take on a phone', () => {
  test('one item at a time with a number pad, a jump by barcode, an item that was not on the list, and the table on a wide screen', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await addItem(page, 'Gin', '900', '5449000000996');
    await addItem(page, 'Whisky', '1200', '4006381333931');
    await addItem(page, 'Rum', '800', '4902102072618');          // no stock: it will not be on the count
    await stockUp(page, 'Gin', '12');
    await stockUp(page, 'Whisky', '24');
    await startCount(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('take-card')).toBeVisible();
    await expect(page.getByTestId('take-lines')).toBeHidden();                       // the table is for wider screens
    await expect(page.getByTestId('card-position')).toHaveText('Item 1 of 2');
    await fits(page, 'the count card');

    // Jump to an item by typing (or scanning) its barcode.
    await page.getByTestId('take-scan').fill('4006381333931');
    await page.getByTestId('take-scan').press('Enter');
    await expect(page.getByTestId('take-scan-note')).toHaveText('Found: Whisky');
    await expect(page.getByTestId('card-name')).toHaveText('Whisky');
    await expect(page.getByTestId('card-expected')).toHaveText('24');
    await expect(page.getByTestId('card-counted')).toHaveText('-');

    // The number pad: digits, a point only once, delete, +1 and -1; the difference follows.
    await page.getByTestId('pad-2').click();
    await page.getByTestId('pad-0').click();
    await expect(page.getByTestId('card-counted')).toHaveText('20');
    await expect(page.getByTestId('card-diff')).toHaveText('-4');
    await page.getByTestId('pad-.').click();
    await page.getByTestId('pad-.').click();                                         // a second point does nothing
    await page.getByTestId('pad-5').click();
    await expect(page.getByTestId('card-counted')).toHaveText('20.5');
    await page.getByTestId('pad-back').click();
    await page.getByTestId('pad-back').click();
    await page.getByTestId('pad-plus').click();
    await expect(page.getByTestId('card-counted')).toHaveText('21');
    await page.getByTestId('pad-minus').click();
    await expect(page.getByTestId('card-counted')).toHaveText('20');
    const key = await page.getByTestId('pad-7').boundingBox();
    expect(key!.height, 'a key a thumb can hit').toBeGreaterThanOrEqual(52);
    await expect(page.getByTestId('card-progress')).toHaveText('1 counted');

    // Next not counted goes to the other item; Previous comes back.
    await page.getByTestId('card-next-open').click();
    await expect(page.getByTestId('card-name')).toHaveText('Gin');
    await page.getByTestId('pad-1').click();
    await page.getByTestId('pad-2').click();
    await expect(page.getByTestId('card-diff')).toHaveText('0');
    await expect(page.getByTestId('card-progress')).toHaveText('2 counted');
    await expect(page.getByTestId('card-prev')).toBeDisabled();                      // the list is Gin, Whisky: Gin is first
    await page.getByTestId('card-next').click();
    await expect(page.getByTestId('card-name')).toHaveText('Whisky');
    await expect(page.getByTestId('card-next')).toBeDisabled();                      // and Whisky is last
    await page.getByTestId('card-prev').click();
    await expect(page.getByTestId('card-name')).toHaveText('Gin');
    await page.getByTestId('card-next').click();
    await expect(page.getByTestId('card-name')).toHaveText('Whisky');

    // An item that exists but is not on this count is offered, added, and then found.
    await page.getByTestId('take-scan').fill('4902102072618');
    await page.getByTestId('take-scan').press('Enter');
    await expect(page.getByTestId('take-unlisted')).toContainText('Rum is not on this count');
    await page.getByTestId('take-unlisted-add').click();
    await expect(page.getByTestId('take-unlisted')).toHaveCount(0);
    await page.getByTestId('take-scan').fill('4902102072618');
    await page.getByTestId('take-scan').press('Enter');
    await expect(page.getByTestId('card-name')).toHaveText('Rum');
    await page.getByTestId('pad-5').click();
    await page.getByTestId('take-scan').fill('1111111111116');
    await page.getByTestId('take-scan').press('Enter');
    await expect(page.getByTestId('take-scan-note')).toContainText('No item has the code 1111111111116');

    // Saved from the card, and the numbers are the ones typed.
    await expect(page.getByTestId('card-save')).toBeEnabled();
    await page.getByTestId('card-save').click();
    await expect(page.getByTestId('card-save')).toBeDisabled();
    await expect(page.getByTestId('card-save')).toContainText('(0)');

    // A wide screen shows the table again, and a scan lands in the count box.
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByTestId('take-lines')).toBeVisible();
    await expect(page.getByTestId('take-card')).toBeHidden();
    await page.getByTestId('take-scan').fill('4006381333931');
    await page.getByTestId('take-scan').press('Enter');
    await expect(page.getByTestId('count-Whisky')).toBeFocused();
    await expect(page.getByTestId('count-Whisky')).toHaveValue('20');
    await expect(page.getByTestId('count-Gin')).toHaveValue('12');
    await expect(page.getByTestId('count-Rum')).toHaveValue('5');

    // The count goes on to review as before: a difference still needs its explanation.
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('take-error')).toContainText('need an explanation before submitting');
    await page.getByTestId('explain-Whisky').fill('A bottle broke');
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('take-status')).toHaveText('Submitted');
  });
});

import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

async function seedDemo(page: Page) {
  await page.goto('/app/settings/operations');
  await page.getByTestId('seed-demo').click();
  await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);
}

async function sellBeans(page: Page, label: string, count: number, pay: boolean) {
  await page.goto('/app/pos');
  await expect(page.getByTestId('product-grid')).toContainText('Demo Canned Beans');
  await page.getByTestId('new-bill').click();
  await page.getByTestId('nb-label').fill(label);
  await page.getByTestId('nb-create').click();
  for (let i = 0; i < count; i++) await page.getByTestId('product-Demo Canned Beans').click();
  if (pay) {
    await page.getByTestId('pay').click();
    await page.getByTestId('pay-confirm').click();
    await expect(page.getByTestId('bill-status')).toHaveText('Paid');
  }
  await expect(page.getByTestId('sync-pending')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Branded receipts and a live dashboard (criteria 10, 35)', () => {
  test('a saved brand appears on the receipt: name, tagline, header and footer', async ({ page }) => {
    await registerViaUi(page, { name: 'Receipt Bar' });
    await page.getByTestId('tagline').fill('Pour it right');
    await page.getByTestId('tab-receipt').click();
    await page.getByLabel('Receipt header').fill('12 Admiralty Way, VAT 123456');
    await page.getByLabel('Receipt footer').fill('Thank you, come again');
    await page.getByTestId('save-continue').click();
    await expect(page.getByTestId('brand-done')).toBeVisible();

    await seedDemo(page);
    await sellBeans(page, 'Receipt tab', 1, true);
    await page.getByTestId('receipt').click();

    const receipt = page.getByTestId('receipt-view');
    await expect(receipt).toContainText('Receipt Bar');
    await expect(receipt).toContainText('Pour it right');
    await expect(receipt).toContainText('12 Admiralty Way, VAT 123456');
    await expect(receipt).toContainText('Thank you, come again');
    await expect(receipt).toContainText('Demo Canned Beans');
    await expect(page.getByTestId('receipt-total')).toContainText('900.00');
  });

  test('the dashboard shows real sales and open tabs, and setup steps complete when they are really done', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);

    await page.goto('/app/dashboard');
    await expect(page.getByTestId('open-tabs')).toHaveText('0');
    await expect(page.getByTestId('sales-today')).toContainText('0.00');
    await expect(page.getByTestId('step-Subscription')).toContainText('To do');
    await expect(page.getByTestId('step-Staff')).toContainText('To do');

    await seedDemo(page);
    await sellBeans(page, 'Paid tab', 2, true);   // 2 x 900
    await sellBeans(page, 'Open tab', 1, false);  // not a sale yet

    await page.goto('/app/dashboard');
    await expect(page.getByTestId('sales-today')).toContainText('1,800.00');
    await expect(page.getByTestId('open-tabs')).toHaveText('1');
    await expect(page.getByTestId('card-sales')).not.toContainText('demo'); // cash is real money; only the development card stub is labelled as demonstration

    // Saving a payment method completes the Subscription step.
    await page.goto('/app/subscription');
    await page.getByTestId('pm-token').fill('tok_ok');
    await page.getByTestId('pm-save').click();
    await expect(page.getByTestId('payment-method')).toContainText('Payment method saved.');
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('step-Subscription')).toContainText('Complete');
  });
});

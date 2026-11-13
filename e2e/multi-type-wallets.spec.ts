import { expect, test } from '@playwright/test';
import { PASSWORD, answerBarManQuestion, pick } from './helpers';

test.describe('Business types and wallets at registration', () => {
  test('a business can be several types, and wallets are offered for the chosen currencies', async ({ page }) => {
    const id = Math.random().toString(36).slice(2, 8);
    await page.goto('/register');

    await pick(page, 'enterprise-type', 'Bar');
    await expect(page.getByTestId('extra-type-Bar')).toHaveCount(0);        // the main type is not offered twice
    await page.getByTestId('extra-type-Nightclub').check();
    await page.getByTestId('extra-type-Hotel').check();
    await expect(page.getByTestId('setup-summary')).toContainText('Recipes & volumetric depletion');

    // Choosing a different main type removes it from the extras.
    await pick(page, 'enterprise-type', 'Hotel');
    await expect(page.getByTestId('extra-type-Nightclub')).toBeChecked();
    await expect(page.getByTestId('extra-type-Hotel')).toHaveCount(0);
    await answerBarManQuestion(page);                                        // still a bar-type business through its Nightclub side
    await page.getByTestId('next').click();

    await page.getByTestId('company-name').fill(`E2E Multi ${id}`);
    await page.getByTestId('slug').fill(`e2e-${id}`);
    await page.getByTestId('business-email').fill(`hello-${id}@example.com`);
    await page.getByTestId('business-phone').fill('+2348012345678');
    await page.getByTestId('location').fill('12 Admiralty Way, Lekki, Lagos');

    // Nigeria is the default country, so NGN is the default wallet: ticked and locked.
    await expect(page.getByTestId('wallet-NGN')).toBeChecked();
    await expect(page.getByTestId('wallet-NGN')).toBeDisabled();
    await page.getByTestId('wallet-USD').check();
    await page.getByTestId('wallet-CNY').check();
    await page.getByTestId('wallet-JPY').check();

    // A different home currency makes that wallet the locked default.
    await pick(page, 'currency', 'JPY');
    await expect(page.getByTestId('wallet-JPY')).toBeDisabled();
    await expect(page.getByTestId('wallet-NGN')).toBeEnabled();
    await pick(page, 'currency', 'NGN');

    await expect(page.getByTestId('next')).toBeEnabled();
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.getByTestId('admin-name').isVisible()) break;
      await page.getByTestId('next').click({ timeout: 5000 }).catch(() => undefined);
      await page.getByTestId('admin-name').waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
    }
    await page.getByTestId('admin-name').fill('Ada Obi');
    await page.getByTestId('admin-email').fill(`owner-${id}@example.com`);
    await page.getByTestId('admin-password').fill(PASSWORD);
    await page.getByTestId('admin-confirm').fill(PASSWORD);
    await page.getByTestId('accept-terms').check();
    await page.getByTestId('submit').click();
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});

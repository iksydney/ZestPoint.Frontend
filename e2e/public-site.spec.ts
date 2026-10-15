import { expect, test } from '@playwright/test';

test.describe('Public site forms are real (criterion 35)', () => {
  test('a demo request is sent to the server and the visitor is only thanked when it was saved', async ({ page }) => {
    let posted = 0;
    page.on('response', (r) => { if (r.url().includes('/api/v1/public/contact') && r.status() === 200) posted++; });

    await page.goto('/contact');
    await page.locator('#f-name').fill('Ada Obi');
    await page.locator('#f-businessName').fill(`Blue Heron ${Date.now()}`);
    await page.locator('#f-venueType').selectOption('Nightclub');
    await page.locator('#f-staffCount').selectOption('11-25');
    await page.locator('#f-email').fill(`ada-${Date.now()}@example.com`);
    await page.locator('#f-phone').fill('+2348012345678');
    await page.locator('#f-message').fill('We would like a demo of the POS and inventory next week.');
    await page.getByRole('button', { name: /request|send|book|submit/i }).first().click();

    await expect(page.getByText('Thanks! Our team will reach out')).toBeVisible();
    expect(posted).toBe(1); // a real request reached the API, not a simulated success
  });

  test('when the server cannot be reached the form says so instead of pretending', async ({ page }) => {
    await page.route('**/api/v1/public/contact', (route) => route.abort('connectionrefused'));
    await page.goto('/contact');
    await page.locator('#f-name').fill('Ada Obi');
    await page.locator('#f-businessName').fill('Blue Heron');
    await page.locator('#f-venueType').selectOption('Lounge');
    await page.locator('#f-staffCount').selectOption('1-10');
    await page.locator('#f-email').fill('ada@example.com');
    await page.locator('#f-phone').fill('+2348012345678');
    await page.locator('#f-message').fill('Please call me about pricing for two venues.');
    await page.getByRole('button', { name: /request|send|book|submit/i }).first().click();

    await expect(page.getByText('Thanks! Our team will reach out')).toHaveCount(0);
    await expect(page.getByText(/could not reach the server|try again/i).first()).toBeVisible();
  });
});

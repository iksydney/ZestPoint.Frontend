import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * The till's left column (Open bills): the heading has its own line, and New, Table requests and Gift card sit below it without touching each other or leaving the card.
 * The owner reported them squeezed into one row beside the heading (2026-11-22); the column is only 15rem wide on a desktop, so the buttons wrap.
 */

interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `${selector} is on the screen`).not.toBeNull();
  return b!;
}

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function checkOpenBillsHeader(page: Page): Promise<void> {
  await page.goto('/app/pos');
  const section = '[aria-label="Open bills"]';
  await expect(page.getByTestId('new-bill')).toBeVisible();
  await expect(page.getByTestId('table-requests-btn')).toBeVisible();
  await expect(page.getByTestId('sell-gift-card')).toBeVisible();

  const card = await box(page, section);
  const heading = await box(page, `${section} h2`);
  const parts = { 'New': await box(page, '[data-testid="new-bill"]'), 'Table requests': await box(page, '[data-testid="table-requests-btn"]'), 'Gift card': await box(page, '[data-testid="sell-gift-card"]') };

  // The heading is above every button, and no two buttons (nor the heading and a button) touch.
  for (const [name, b] of Object.entries(parts)) {
    expect(heading.y + heading.height, `the heading ends before "${name}" starts`).toBeLessThanOrEqual(b.y + 0.5);
    expect(b.x, `"${name}" is inside the card on the left`).toBeGreaterThanOrEqual(card.x);
    expect(b.x + b.width, `"${name}" is inside the card on the right`).toBeLessThanOrEqual(card.x + card.width + 0.5);
  }
  const names = Object.keys(parts) as (keyof typeof parts)[];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
    expect(overlap(parts[names[i]!], parts[names[j]!]), `"${names[i]}" and "${names[j]}" do not overlap`).toBe(false);

  // Each label stays on one line: a button as tall as its text plus padding, not three lines of it.
  for (const [name, b] of Object.entries(parts)) expect(b.height, `"${name}" is one line high`).toBeLessThan(48);
}

test.describe('The till: open bills header', () => {
  test('the heading and the three buttons do not squeeze together, on a desktop and on a phone', async ({ page }) => {
    test.slow();
    await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);

    await page.setViewportSize({ width: 1280, height: 800 });
    await checkOpenBillsHeader(page);

    await page.setViewportSize({ width: 390, height: 800 });
    await checkOpenBillsHeader(page);
  });
});

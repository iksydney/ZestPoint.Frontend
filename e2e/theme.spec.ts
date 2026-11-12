import { Page, expect, test } from '@playwright/test';
import { cssVar } from './helpers';

/** The guest entry pages (register, accept-invite) have no venue theme yet, so they follow the public light/dark choice. */

const LIGHT_CANVAS = '241 245 249';
const DARK_CANVAS = '11 18 32';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: string): number {
  const [r, g, b] = rgb.trim().split(/\s+/).map(Number) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two "r g b" triplets. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Body text and the status colours must stay at 4.5:1 or better on both surfaces of the current theme (Article 8). */
async function expectAaTokens(page: Page): Promise<void> {
  const [canvas, panel, ink, success, warning, danger, primary, onPrimary] = await Promise.all(
    ['--canvas-rgb', '--panel-rgb', '--ink-rgb', '--success-rgb', '--warning-rgb', '--danger-rgb', '--primary-rgb', '--on-primary-rgb'].map((n) => cssVar(page, n)));

  for (const [name, text] of [['ink', ink], ['success', success], ['warning', warning], ['danger', danger]] as const) {
    for (const [surfaceName, surface] of [['canvas', canvas], ['panel', panel]] as const) {
      expect(contrast(text!, surface!), `${name} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(onPrimary!, primary!), 'on-primary on primary').toBeGreaterThanOrEqual(4.5);
}

test.describe('Sign-up and invitation pages have light and dark themes', () => {
  test('register follows the OS until the visitor chooses, and the choice sticks', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/register');

    const toggle = page.getByRole('switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(LIGHT_CANVAS);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(DARK_CANVAS);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(DARK_CANVAS);
  });

  test('an OS set to dark starts dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/register');

    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(DARK_CANVAS);
  });

  test('text and status colours keep WCAG AA contrast in both themes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/register');
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(LIGHT_CANVAS);
    await expectAaTokens(page);

    await page.getByRole('switch').click();
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(DARK_CANVAS);
    await expectAaTokens(page);
  });

  test('the theme is applied only while an entry page is open', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });

    // From the marketing site into register: the entry theme must be in place (attach after the old page detaches).
    await page.goto('/');
    await page.getByRole('link', { name: 'Register' }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator('html')).toHaveClass(/\bzp-entry\b/);
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(LIGHT_CANVAS);

    // From register into sign-in (venue-themed, not an entry page): nothing is left behind.
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('html')).not.toHaveClass(/\bzp-entry\b/);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(DARK_CANVAS);
  });

  test('accept-invite has the same switch and follows the same choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/accept-invite?venue=no-such-venue&token=no-such-token');

    const toggle = page.getByRole('switch');
    await expect(toggle).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/\bzp-entry\b/);
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(LIGHT_CANVAS);

    await toggle.click();
    await expect.poll(() => cssVar(page, '--canvas-rgb')).toBe(DARK_CANVAS);
  });
});

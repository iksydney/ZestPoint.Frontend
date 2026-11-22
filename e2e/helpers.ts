import { Browser, BrowserContext, Locator, Page, expect } from '@playwright/test';

export const PASSWORD = 'Str0ngPassw0rd!';

/** A real 32x32 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGklEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAA4G0QIAAB1wFq6gAAAABJRU5ErkJggg==',
  'base64'
);

export interface Registered {
  name: string;
  slug: string;
  email: string;
}

const unique = () => Math.random().toString(36).slice(2, 8);

/** Picks an option in a zp-search-select by typing and pressing Enter. */
export async function pick(page: Page, testId: string, text: string): Promise<void> {
  const box = page.getByTestId(testId);
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

/**
 * Chooses an entry of a searchable list (`zp-search-select`) the way a person does: click the box, type the words, press Enter. The first
 * entry that fits the words is taken, an exact name before a partial one, so type enough of the name to be the first fit. `scope` is the
 * page or any part of it. It takes the place of `selectOption` wherever a native select was made searchable.
 */
export async function choose(scope: Page | Locator, testId: string, text: string): Promise<void> {
  const box = scope.getByTestId(testId);
  const list = scope.getByTestId(`${testId}-list`);
  await box.click();
  await box.fill(text);
  // Entries read from the server can arrive a moment after the box is drawn: wait until one fits the words, then take it.
  await expect(list.locator('[data-value]').first()).toBeVisible();
  await box.press('Enter');
  await expect(list).toHaveCount(0);
}

/** A bar-type business must answer "Will you use the bar man method?" before it can continue. Fails when the question is not asked. */
export async function answerBarManQuestion(page: Page, use = false): Promise<void> {
  await expect(page.getByTestId('bar-man-question')).toBeVisible();
  await page.getByTestId(use ? 'bar-man-yes' : 'bar-man-no').check();
}

/**
 * Answers the bar man question when the chosen type is asked it, and does nothing otherwise. Typing a type name picks the first entry that fits
 * (the search lists an exact name first since 2026-11-22; before that "Bar" found Retail Store through "barcode": FND-076), so this looks at what
 * the page asks instead of trusting which type was picked.
 */
export async function answerBarManQuestionIfAsked(page: Page, use = false): Promise<void> {
  await expect(page.getByTestId('setup-summary')).not.toContainText('Pick your business type'); // the chosen type has been applied
  if (await page.getByTestId('bar-man-question').count()) await page.getByTestId(use ? 'bar-man-yes' : 'bar-man-no').check();
}

/** Walks the real registration flow in the browser and lands on the onboarding wizard. */
export async function registerViaUi(page: Page, opts: { name?: string; type?: string; barManMethod?: boolean } = {}): Promise<Registered> {
  const id = unique();
  const name = opts.name ?? `E2E Venue ${id}`;
  const email = `owner-${id}@example.com`;
  const type = opts.type ?? 'Bar';

  await page.goto('/register');
  await pick(page, 'enterprise-type', type);
  if (opts.barManMethod !== undefined) await answerBarManQuestion(page, opts.barManMethod); // the caller needs a bar-type business
  else await answerBarManQuestionIfAsked(page);
  await page.getByTestId('next').click();

  await page.getByTestId('company-name').fill(name);
  // The e2e database persists between runs, so make the subdomain unique.
  await page.getByTestId('slug').fill(`e2e-${id}`);
  await page.getByTestId('business-email').fill(`hello-${id}@example.com`);
  await page.getByTestId('business-phone').fill('+2348012345678');
  await page.getByTestId('location').fill('12 Admiralty Way, Lekki, Lagos');
  await expect(page.getByTestId('next')).toBeEnabled();
  const slug = await page.getByTestId('slug').inputValue();
  // The availability check can finish just as the button is pressed and swallow the click; press again until the next step appears.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await page.getByTestId('admin-name').isVisible()) break;
    await page.getByTestId('next').click({ timeout: 5000 }).catch(() => undefined);
    await page.getByTestId('admin-name').waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
  }

  await page.getByTestId('admin-name').fill('Ada Obi');
  await page.getByTestId('admin-email').fill(email);
  await page.getByTestId('admin-password').fill(PASSWORD);
  await page.getByTestId('admin-confirm').fill(PASSWORD);
  await page.getByTestId('accept-terms').check();
  await page.getByTestId('submit').click();

  await expect(page).toHaveURL(/\/onboarding$/);
  return { name, slug, email };
}

export async function signInViaUi(page: Page, who: Registered): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(who.slug);
  await page.getByTestId('login-email').fill(who.email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
}

/** Reads a CSS custom property from an element (or the document root when no selector is given). */
export async function cssVar(page: Page, name: string, testId?: string): Promise<string> {
  return page.evaluate(
    ([n, id]) => {
      const el = id ? document.querySelector(`[data-testid="${id}"]`)! : document.documentElement;
      return getComputedStyle(el).getPropertyValue(n).trim();
    },
    [name, testId ?? null] as const
  );
}

export async function newContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Sets a colour through the hex field (the same path a person typing would use). */
export async function setHex(page: Page, which: 'primary' | 'secondary' | 'background' | 'surface' | 'text', value: string): Promise<void> {
  const field = page.getByTestId(`hex-${which}`);
  await field.fill(value);
}

/**
 * A cashier who signs in with no shift running must start one before anything else (owner's rule, 2026-11-15): the box is filled and
 * the shift started, after which the application behind it can be used.
 */
export async function startShiftWhenAsked(page: Page, float = '0'): Promise<void> {
  const box = page.getByTestId('shift-box');
  await expect(box).toBeVisible();
  await box.getByTestId('shift-box-float').fill(float);
  await box.getByTestId('shift-box-confirm').check();
  await box.getByTestId('shift-box-start').click();
  await expect(box).toHaveCount(0);
}

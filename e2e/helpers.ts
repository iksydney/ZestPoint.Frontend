import { Browser, BrowserContext, Page, expect } from '@playwright/test';

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

/** Walks the real registration flow in the browser and lands on the onboarding wizard. */
export async function registerViaUi(page: Page, opts: { name?: string; type?: string } = {}): Promise<Registered> {
  const id = unique();
  const name = opts.name ?? `E2E Venue ${id}`;
  const email = `owner-${id}@example.com`;

  await page.goto('/register');
  await pick(page, 'enterprise-type', opts.type ?? 'Bar');
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

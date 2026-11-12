import { Page, expect, test } from '@playwright/test';

const OPERATOR_EMAIL = 'operator@zestpoint.e2e';
const OPERATOR_PASSWORD = 'Operat0r-E2E-Passw0rd!';

async function operatorSignIn(page: Page) {
  await page.goto('/platform/login');
  await page.getByTestId('platform-email').fill(OPERATOR_EMAIL);
  await page.getByTestId('platform-password').fill(OPERATOR_PASSWORD);
  await page.getByTestId('platform-submit').click();
  await expect(page).toHaveURL(/\/platform\/overview$/);
}

test.describe('A platform operator stays signed in across tabs and reloads (httpOnly refresh cookie)', () => {
  test('opening a navigation entry in a new tab of the same browser opens that page, not the sign-in', async ({ page, context }) => {
    await operatorSignIn(page);

    // Ctrl+click is how people open a navigation entry in a new tab.
    const [tab] = await Promise.all([context.waitForEvent('page'), page.getByTestId('nav-tenants').click({ modifiers: ['Control'] })]);
    await tab.waitForLoadState();
    await expect(tab).toHaveURL(/\/platform\/tenants$/);
    await expect(tab.getByTestId('operator-name')).toBeVisible();          // the console, signed in, not the form
    await expect(tab.getByTestId('platform-submit')).toHaveCount(0);

    // Typing an address in a brand-new tab behaves the same way.
    const typed = await context.newPage();
    await typed.goto('/platform/plans');
    await expect(typed).toHaveURL(/\/platform\/plans$/);
    await expect(typed.getByTestId('operator-name')).toBeVisible();
  });

  test('a reload keeps the operator signed in and keeps the permissions of their role', async ({ page }) => {
    await operatorSignIn(page);
    await page.reload();
    await expect(page).toHaveURL(/\/platform\/overview$/);
    await expect(page.getByTestId('operator-name')).toBeVisible();
    await expect(page.getByTestId('nav-operators')).toBeVisible();          // an administrator still sees the operators page after the reload
  });

  test('the sign-in form is skipped when the browser already holds a session', async ({ page, context }) => {
    await operatorSignIn(page);
    const other = await context.newPage();
    await other.goto('/platform/login');
    await expect(other).toHaveURL(/\/platform\/overview$/);
  });

  test('the cookie cannot be read by page scripts and the access token is kept out of web storage', async ({ page, context }) => {
    await operatorSignIn(page);

    const cookie = (await context.cookies()).find((c) => c.name === 'zp_prt');
    expect(cookie, 'the operator refresh cookie').toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    expect(cookie!.path).toBe('/api/v1/platform/auth');

    const seenByScripts = await page.evaluate(() => ({
      cookie: document.cookie,
      storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    }));
    expect(seenByScripts.cookie).not.toContain('zp_prt');
    expect(seenByScripts.storage).not.toMatch(/eyJ|zp_prt|refresh/i);       // no JWT, no refresh token
  });

  test('signing out in one tab signs out the other tab and a new tab has to sign in again', async ({ page, context }) => {
    await operatorSignIn(page);
    const second = await context.newPage();
    await second.goto('/platform/tenants');
    await expect(second.getByTestId('operator-name')).toBeVisible();

    await page.getByTestId('platform-signout').click();
    await expect(page).toHaveURL(/\/platform\/login$/);
    await expect(second).toHaveURL(/\/platform\/login$/);                  // told by the other tab, without a click

    expect((await context.cookies()).find((c) => c.name === 'zp_prt' && c.value)).toBeUndefined();   // the cookie is gone

    const third = await context.newPage();
    await third.goto('/platform/overview');
    await expect(third).toHaveURL(/\/platform\/login$/);                   // nothing left to restore
    await expect(third.getByTestId('platform-submit')).toBeVisible();
  });

  test('a visitor with no session is sent to the sign-in and an expired cookie does not loop', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/platform/tenants');
    await expect(page).toHaveURL(/\/platform\/login$/);

    await context.addCookies([{ name: 'zp_prt', value: 'not-a-real-token', domain: 'localhost', path: '/api/v1/platform/auth', httpOnly: true, sameSite: 'Strict' }]);
    await page.goto('/platform/plans');
    await expect(page).toHaveURL(/\/platform\/login$/);
    await expect(page.getByTestId('platform-submit')).toBeVisible();
  });
});

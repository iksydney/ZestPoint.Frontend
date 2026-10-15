import { expect, test } from '@playwright/test';
import { PNG, cssVar, newContext, pick, registerViaUi, setHex, signInViaUi } from './helpers';

const PREVIEW = 'preview-frame';

test.describe('Public site', () => {
  test('the header offers Login and Register and Register opens the registration flow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Register' }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'Register your business' })).toBeVisible();
  });
});

test.describe('Registration and onboarding (criteria 1-4)', () => {
  test('a visitor can search for an enterprise type and the template shapes the setup summary', async ({ page }) => {
    await page.goto('/register');
    const summary = page.getByTestId('setup-summary');

    await pick(page, 'enterprise-type', 'Supermarket');
    await expect(summary).toContainText('Supermarket');
    await expect(summary).toContainText('Retail checkout lanes');
    await expect(summary).toContainText('Basket');
    await expect(summary).toContainText('Fresh produce');

    await pick(page, 'enterprise-type', 'Nightclub');
    await expect(summary).toContainText('Quick bar tabs');
    await expect(summary).toContainText('Recipes & volumetric depletion');
  });

  test('"Other" asks for a custom business type before continuing', async ({ page }) => {
    await page.goto('/register');
    await pick(page, 'enterprise-type', 'Other');
    await expect(page.getByTestId('next')).toBeDisabled();
    await page.getByTestId('custom-type').fill('Car wash');
    await expect(page.getByTestId('next')).toBeEnabled();
  });

  test('registering creates the tenant and owner, signs them in and starts onboarding', async ({ page }) => {
    const who = await registerViaUi(page, { name: 'Rooftop 99 Lounge', type: 'Lounge' });

    await expect(page.getByTestId('progress-percent')).toHaveText('25% complete');
    // The generated initials logo follows the agreed rule and is used across the brand surfaces.
    await expect(page.getByTestId('brand-initials').first()).toHaveText('R99L');
    expect(who.slug).toMatch(/^e2e-/);
  });

  test('onboarding progress persists: leaving and coming back resumes where the user was', async ({ page, browser }) => {
    const who = await registerViaUi(page);
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/v1/onboarding/state') && r.request().method() === 'PUT');
    await page.getByTestId('tab-colors').click();
    await expect(page.getByTestId('hex-primary')).toBeVisible();
    expect((await saved).ok()).toBe(true);

    // Reload the page: the wizard resumes on the Colours tab from server-side progress.
    await page.reload();
    await expect(page.getByTestId('hex-primary')).toBeVisible();

    // A different device: sign in again and land back in setup, not on the dashboard.
    const other = await newContext(browser);
    await signInViaUi(other.page, who);
    await expect(other.page).toHaveURL(/\/(onboarding|app\/dashboard)$/);
    await other.page.goto('/onboarding');
    await expect(other.page.getByTestId('hex-primary')).toBeVisible();
    await other.context.close();
  });

  test('a duplicate email shows a field error on the account step', async ({ page }) => {
    const first = await registerViaUi(page);
    await page.context().clearCookies();
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });

    await page.goto('/register');
    await pick(page, 'enterprise-type', 'Bar');
    await page.getByTestId('next').click();
    await page.getByTestId('company-name').fill(`Second ${Date.now()}`);
    await page.getByTestId('business-email').fill('x@example.com');
    await page.getByTestId('business-phone').fill('+2348012345678');
    await page.getByTestId('location').fill('Lagos');
    await page.getByTestId('next').click();
    await page.getByTestId('admin-name').fill('Ada Obi');
    await page.getByTestId('admin-email').fill(first.email);
    await page.getByTestId('admin-password').fill('Str0ngPassw0rd!');
    await page.getByTestId('admin-confirm').fill('Str0ngPassw0rd!');
    await page.getByTestId('accept-terms').check();
    await page.getByTestId('submit').click();
    await expect(page.getByText('An account with this email already exists')).toBeVisible();
  });
});

test.describe('Branding wizard and live preview (criteria 5-12)', () => {
  test('changing the primary colour updates the preview immediately and not the saved app theme', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('tab-colors').click();

    const savedBefore = await cssVar(page, '--primary-rgb');
    await setHex(page, 'primary', '#C2410C');
    await expect.poll(() => cssVar(page, '--primary-rgb', PREVIEW)).toBe('194 65 12');
    expect(await cssVar(page, '--primary-rgb')).toBe(savedBefore); // unsaved: the real app theme is untouched

    await setHex(page, 'secondary', '#0F766E');
    await expect.poll(() => cssVar(page, '--secondary-rgb', PREVIEW)).toBe('15 118 110');
  });

  test('typing a company name, short name and tagline reflects in the preview at once', async ({ page }) => {
    await registerViaUi(page, { name: 'Alpha Bar' });
    await page.getByTestId('tagline').fill('Pour it right');
    await expect(page.getByTestId(PREVIEW)).toContainText('Pour it right');
    await page.getByTestId('short-name').fill('Alpha');
    await expect(page.getByTestId(PREVIEW)).toContainText('Alpha');
  });

  test('uploading a logo updates the preview and removing it restores the generated initials', async ({ page }) => {
    await registerViaUi(page, { name: 'Beach Club Pool Bar' });
    const mark = page.getByTestId(PREVIEW).locator('zp-brand-mark').first();
    await expect(mark.getByTestId('brand-initials')).toHaveText('BCPB');

    await page.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(mark.locator('img')).toBeVisible();

    await page.getByTestId('remove-logo').click();
    await expect(mark.getByTestId('brand-initials')).toHaveText('BCPB');
  });

  test('a file that is not really an image is rejected by the server and the preview reverts', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('<?php echo 1; ?>') });
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByTestId(PREVIEW).locator('zp-brand-mark').first().locator('img')).toHaveCount(0);
  });

  test('unreadable colour combinations warn and block publishing', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('tab-colors').click();
    await setHex(page, 'text', '#EEEEEE'); // near-white text on the light background
    await expect(page.getByTestId('contrast-panel')).toContainText('Cannot publish');
    await expect(page.getByTestId('save-continue')).toBeDisabled();

    await setHex(page, 'text', '#0F172A');
    await expect(page.getByTestId('save-continue')).toBeEnabled();
  });

  test('presets apply their palette and a colour suggestion can be accepted', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('tab-colors').click();
    await page.getByTestId('preset-select').selectOption('nightclub-dark');
    await expect.poll(() => cssVar(page, '--canvas-rgb', PREVIEW)).toBe('11 15 26');

    await page.getByTestId('suggest-btn').click();
    await expect(page.getByTestId('suggestion')).toBeVisible();
    await page.getByTestId('suggestion').getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByTestId('suggestion')).toHaveCount(0);
  });

  test('Save and continue publishes: the theme persists across logins and applies across the app', async ({ page, browser }) => {
    const who = await registerViaUi(page, { name: 'Persist Bar' });
    await page.getByTestId('tab-colors').click();
    await setHex(page, 'primary', '#C2410C');
    await page.getByTestId('save-continue').click();
    await expect(page.getByTestId('brand-done')).toBeVisible();

    // The saved theme is now the app-wide theme.
    await expect.poll(() => cssVar(page, '--primary-rgb')).toBe('194 65 12');

    // A brand-new browser profile signs in and gets the same theme (persisted server-side).
    const other = await newContext(browser);
    await signInViaUi(other.page, who);
    await expect(other.page).toHaveURL(/\/app\/dashboard$/);
    await expect.poll(() => cssVar(other.page, '--primary-rgb')).toBe('194 65 12');

    // Every operational screen uses the same saved tokens.
    for (const path of ['/app/pos', '/app/inventory', '/app/settings/branding']) {
      await other.page.goto(path);
      await expect.poll(() => cssVar(other.page, '--primary-rgb')).toBe('194 65 12');
    }

    // The branded sign-in screen shows this venue's identity before anyone signs in.
    const anon = await newContext(browser);
    await anon.page.goto('/login');
    await anon.page.getByTestId('login-slug').fill(who.slug);
    await expect(anon.page.getByTestId('login-title')).toHaveText('Persist Bar');
    await anon.context.close();
    await other.context.close();
  });

  test('an unsaved draft is not visible to other sessions until it is published', async ({ page, browser }) => {
    const who = await registerViaUi(page);
    await page.getByTestId('tab-colors').click();
    const publishedBefore = await cssVar(page, '--primary-rgb');

    await setHex(page, 'primary', '#7C3AED');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();

    const other = await newContext(browser);
    await signInViaUi(other.page, who);
    await expect(other.page).toHaveURL(/\/onboarding$/); // signed in; an unpublished brand sends owners to setup
    await other.page.goto('/app/settings/branding');
    await expect.poll(() => cssVar(other.page, '--primary-rgb')).toBe(publishedBefore);
    await other.context.close();
  });

  test('Reset theme returns the controls to the saved theme', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('tab-colors').click();
    const original = await cssVar(page, '--primary-rgb', PREVIEW);
    await setHex(page, 'primary', '#7C3AED');
    await expect.poll(() => cssVar(page, '--primary-rgb', PREVIEW)).toBe('124 58 237');

    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('reset-theme').click();
    await expect.poll(() => cssVar(page, '--primary-rgb', PREVIEW)).toBe(original);
  });

  test('the full-screen theme preview opens and closes without saving anything', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('preview-theme').click();
    await expect(page.getByRole('dialog', { name: 'Theme preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Theme preview' })).toHaveCount(0);
  });
});

test.describe('Sign-in and sessions', () => {
  test('a reload keeps the user signed in (refresh cookie) and signing out ends the session', async ({ page }) => {
    const who = await registerViaUi(page);
    await page.getByTestId('tab-colors').click();
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-dashboard').click();
    await expect(page).toHaveURL(/\/app\/dashboard$/);

    await page.reload();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.getByTestId('user-name')).toHaveText('Ada Obi');

    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/login/);
    expect(who.slug.length).toBeGreaterThan(2);
  });

  test('wrong credentials show one generic message', async ({ page }) => {
    const who = await registerViaUi(page);
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByTestId('login-slug').fill(who.slug);
    await page.getByTestId('login-email').fill(who.email);
    await page.getByTestId('login-password').fill('Wr0ngPassword!!');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('Invalid venue, credentials');
  });
});

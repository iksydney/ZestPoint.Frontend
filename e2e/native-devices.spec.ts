import { expect, test } from '@playwright/test';
import { PASSWORD } from './helpers';
import { ownerInApp } from './phone-helpers';

/**
 * Phones signed in to the app (enterprise programme, piece 14): the owner sees each phone by the name its person gave it, and can sign one out without
 * signing out the others. The phone's own sign-in is the app's endpoint, so the test makes it the way the app does.
 */
test.describe('Phones signed in to the app', () => {
  test('the owner sees a phone by its name on the staff screen, signs it out, and its renewal token stops working', async ({ page }) => {
    const who = await ownerInApp(page);
    const device = (name: string) => ({ deviceId: `e2e-${Math.random().toString(36).slice(2, 12)}-device-0001`, deviceName: name, platform: 'android', appVersion: '1.0.0' });
    const samsung = device("Wale's Samsung");
    const spare = device('Spare handheld');

    const signIn = async (d: ReturnType<typeof device>) => {
      const r = await page.request.post('/api/v1/auth/native/login', { data: { tenantSlug: who.slug, email: who.email, password: PASSWORD, device: d } });
      expect(r.ok(), await r.text()).toBe(true);
      return ((await r.json()) as { result: { renewalToken: string } }).result.renewalToken;
    };
    const samsungToken = await signIn(samsung);
    const spareToken = await signIn(spare);
    const renew = (token: string, d: { deviceId: string }) => page.request.post('/api/v1/auth/native/refresh', { data: { renewalToken: token, deviceId: d.deviceId } });

    await page.goto('/app/staff');
    await page.locator('[data-testid^="manage-"]').first().click();
    const rows = page.locator('div[data-testid^="session-"]');
    const mine = rows.filter({ hasText: "Wale's Samsung" });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Android');
    await expect(mine).toContainText('app 1.0.0');
    await expect(mine.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(rows.filter({ hasText: 'this device' })).toHaveCount(1);                       // this browser: named, but there is no button to sign yourself out of it here
    await expect(rows.filter({ hasText: 'this device' }).getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    await mine.getByRole('button', { name: 'Sign out' }).click();
    await expect(rows.filter({ hasText: "Wale's Samsung" })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Spare handheld' })).toHaveCount(1);                    // the other phone is still signed in
    expect((await renew(samsungToken, samsung)).status()).toBe(401);
    expect((await renew(spareToken, spare)).status()).toBe(200);
  });
});

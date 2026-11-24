import { Page, expect, test } from '@playwright/test';
import { PASSWORD, Registered, newContext, registerViaUi } from './helpers';

/**
 * The list of stations belongs to the signed-in person, not to the page. Signing out is an in-app navigation (the page is not reloaded), so a list
 * kept from the first answer for the whole page session showed one company's station names in the pickers of the next company that signed in on the
 * same tab, until a reload (found by reading the code, 2026-11-24). Company A signs in and sees its own station; A signs out and company B signs in on
 * the same tab with no reload; B's pickers name only B's stations.
 */

/** A company that uses stations (a nightclub with the bar man method), with one more station of its own. */
async function companyWithStation(page: Page, station: string): Promise<Registered> {
  const who = await registerViaUi(page, { type: 'Nightclub', barManMethod: true });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await page.locator('[data-nav="setup.admin"]').click();
  await page.locator('[data-testid="hub-list"] [data-nav="pos.stations"]').click();
  await page.getByTestId('station-new').click();
  await page.getByTestId('station-name').fill(station);
  await page.getByTestId('station-save').click();
  await expect(page.getByTestId(`station-row-${station}`)).toBeVisible();
  return who;
}

/** Opens a new stock card from the menu (no reload) and opens its "Prepared at" list; returns once the list is on screen. */
async function openPreparedAt(page: Page): Promise<void> {
  await page.locator('[data-testid="main-nav"] [data-nav="stock.items"]').click();
  await page.getByTestId('item-new').click();
  await page.getByTestId('item-station').click();
  await expect(page.getByTestId('item-station-list')).toBeVisible();
}

test.describe('The station names in the pickers belong to whoever is signed in', () => {
  test('a second company signing in on the same tab, with no reload, sees only its own stations', async ({ page, browser }) => {
    test.slow();
    const companyA = await companyWithStation(page, 'Alpha Grill');

    // Company B exists already (made in another browser), with a station of its own.
    const other = await newContext(browser);
    const companyB = await companyWithStation(other.page, 'Bravo Grill');
    await other.context.close();

    // A, in this tab, sees its own station and not B's.
    await openPreparedAt(page);
    const list = page.getByTestId('item-station-list');
    await expect(list).toContainText('Alpha Grill');
    await expect(list).not.toContainText('Bravo Grill');
    await page.keyboard.press('Escape');
    await page.getByTestId('sc-close').click();

    // A signs out and B signs in on this same tab: the page is never reloaded.
    await page.evaluate(() => { (window as unknown as { __notReloaded: boolean }).__notReloaded = true; });
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByTestId('login-slug').fill(companyB.slug);
    await page.getByTestId('login-email').fill(companyB.email);
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/app\//);
    await expect(page.getByTestId('user-name')).toBeVisible();

    await openPreparedAt(page);
    const listB = page.getByTestId('item-station-list');
    await expect(listB).toContainText('Bravo Grill');
    await expect(listB).not.toContainText('Alpha Grill');
    expect(await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded)).toBe(true);   // the very same page session

    // And back again: A signs in once more and is shown A's station, not B's.
    await page.keyboard.press('Escape');
    await page.getByTestId('sc-close').click();
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByTestId('login-slug').fill(companyA.slug);
    await page.getByTestId('login-email').fill(companyA.email);
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await openPreparedAt(page);
    const listA = page.getByTestId('item-station-list');
    await expect(listA).toContainText('Alpha Grill');
    await expect(listA).not.toContainText('Bravo Grill');
  });
});

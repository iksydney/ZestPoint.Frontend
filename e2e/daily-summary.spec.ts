import { Page, expect, test } from '@playwright/test';
import { choose, registerViaUi } from './helpers';

/**
 * The daily summary (design of 2026-11-15): switched on and timed in its set-up, with the people who get it; a past day built and kept; read under Sell > Reports
 * and sent to oneself to see that it works.
 */

async function ownerInApp(page: Page) {
  await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

const unread = async (page: Page): Promise<number> => Number((await page.getByTestId('notices-bell').getAttribute('data-count')) ?? '0');

test.describe('Daily summary', () => {
  test('set up who gets it, build yesterday, read it, and send it to oneself', async ({ page }) => {
    test.slow();
    await ownerInApp(page);

    // Set-up is a set-up screen of Admin.
    await page.locator('[data-nav="setup.admin"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="dailysummary"]').click();
    await expect(page.getByTestId('dss-title')).toHaveText('Daily Summary set-up');
    await expect(page.getByTestId('dss-none')).toBeVisible();
    await expect(page.getByTestId('dss-last')).toContainText('Nothing has been sent yet');

    // On, at half past seven.
    await page.getByTestId('dss-enabled').check();
    await page.getByTestId('dss-time').fill('07:30');
    await page.getByTestId('dss-save').click();
    await expect(page.getByTestId('dss-note')).toHaveText('Saved.');
    await page.reload();
    await expect(page.getByTestId('dss-enabled')).toBeChecked();
    await expect(page.getByTestId('dss-time')).toHaveValue('07:30');

    // Someone outside with no way to reach them is refused with the reason; then the owner adds themselves, in the app.
    await page.getByTestId('dss-add').click();
    await page.getByTestId('dss-kind-outside').check();
    await page.getByTestId('dss-name').fill('Mr Boss');
    await page.getByTestId('dss-form-save').click();
    await expect(page.getByTestId('dss-form-error')).toContainText('e-mail address or a phone number');
    await page.getByTestId('dss-kind-staff').check();
    await choose(page, 'dss-staff', 'Ada Obi');                                             // the only person so far: the owner
    await page.getByTestId('dss-way-email').uncheck();                                        // the owner's e-mail is not set up on this server, so the bell is the way
    await expect(page.getByTestId('dss-unavailable').first()).toContainText('not set up');   // SMS and WhatsApp say so
    await page.getByTestId('dss-form-save').click();
    await expect(page.getByTestId('dss-table')).toContainText('in the app');

    // Build yesterday now: it exists, and is read under Sell > Reports.
    await page.getByTestId('dss-build').click();
    await expect(page.getByTestId('dss-note')).toContainText('is built');
    await page.locator('[data-nav="reports.sell"]').click();
    await page.locator('[data-testid="hub-list"] [data-nav="pos.report.summary"]').click();
    await expect(page.getByTestId('sum-title')).toHaveText('Daily Summary');
    await expect(page.getByTestId('sum-days').locator('button')).toHaveCount(1);
    await expect(page.getByTestId('sum-sales')).toContainText('Net sales');
    await expect(page.getByTestId('sum-money')).toBeVisible();
    await expect(page.getByTestId('sum-notes')).toContainText('Net sales = gross sales');
    await expect(page.getByTestId('sum-setup-link')).toBeVisible();

    // Sent to oneself: it reaches the bell.
    const before = await unread(page);
    await page.getByTestId('sum-send-me').click();
    await expect(page.getByTestId('sum-sent')).toContainText('Sent');
    await expect.poll(() => unread(page)).toBe(before + 1);
    await page.getByTestId('notices-bell').click();
    await expect(page.getByTestId('notices-panel')).toContainText('Daily summary for');
  });
});

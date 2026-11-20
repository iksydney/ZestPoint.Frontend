import { Page, expect, test } from '@playwright/test';
import { registerViaUi } from './helpers';

/**
 * Messaging (design of 2026-11-15): the Messages screen under Admin > Set-up says which ways of sending work on this server and what is left of the paid
 * messages, a test to oneself arrives in the notices bell, a message that cannot be sent stays in the list with its reason, and the bell shows what is unread.
 */

async function ownerInApp(page: Page) {
  await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
}

const unread = async (page: Page): Promise<number> => Number((await page.getByTestId('notices-bell').getAttribute('data-count')) ?? '0');

test.describe('Messaging', () => {
  test('the Messages screen is honest about each way of sending, a test reaches the bell, and a failed message keeps its reason', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('notices-bell')).toBeVisible();
    const before = await unread(page);

    // Messages is a set-up screen of Admin, with a line on what it is for.
    await page.locator('[data-nav="setup.admin"]').click();
    await expect(page.locator('[data-testid="hub-list"] [data-nav="messages"]')).toContainText('whether it arrived');
    await page.locator('[data-testid="hub-list"] [data-nav="messages"]').click();
    await expect(page.getByTestId('msg-title')).toHaveText('Messages');
    await expect(page.getByTestId('msg-usage-text')).toContainText(/SMS (and|or) WhatsApp/);

    // In the app is ready; e-mail, SMS and WhatsApp are not set up on the test server and say so.
    await expect(page.getByTestId('msg-channel-In the app')).toContainText('Ready');
    await expect(page.getByTestId('msg-channel-E-mail')).toContainText('Not set up');
    await expect(page.getByTestId('msg-channel-SMS')).toContainText('provider account');

    // Push to phones needs the company's Firebase key, which the test server does not have: it says so, and a test with no phone signed in fails in words.
    await expect(page.getByTestId('msg-channel-Push to phones')).toContainText('Not set up');
    await expect(page.getByTestId('msg-channel-Push to phones')).toContainText('Firebase');
    await page.getByTestId('msg-test-Push').click();
    await expect(page.getByTestId('msg-test-result')).toContainText('The test did not go');
    await expect(page.getByTestId('msg-test-result')).toContainText('no phone signed in');

    // The phones that could be told: none is signed in to the app here, and the section says so (with phones, the server's own tests cover who is listed and that no token is shown).
    await expect(page.getByTestId('msg-phones')).toBeVisible();
    await expect(page.getByTestId('msg-phones-empty')).toContainText('No phone is signed in');

    // A test in the app arrives at once, in the bell.
    await page.getByTestId('msg-test-InApp').click();
    await expect(page.getByTestId('msg-test-result')).toContainText('The test went');
    await expect.poll(() => unread(page)).toBe(before + 1);
    await expect(page.getByTestId('notices-count')).toBeVisible();

    // A test by e-mail cannot go here: it stays in the list with the reason, and can be tried again.
    await page.getByTestId('msg-test-Email').click();
    await expect(page.getByTestId('msg-test-result')).toContainText('The test did not go');
    await expect(page.getByTestId('msg-test-result')).toContainText('E-mail is not set up');
    await page.getByTestId('msg-filter-status').selectOption('Failed');
    await page.getByTestId('msg-apply').click();
    const row = page.getByTestId('msg-row-Test message from ZestPoint').first();
    await expect(row).toHaveAttribute('data-status', 'Failed');
    await expect(row.getByTestId('msg-error-text')).toContainText('E-mail is not set up');
    await expect(row).toContainText('***@');                                                // the address is masked: its first letter and its domain only
    await expect(page.getByTestId('msg-retry-Test message from ZestPoint').first()).toBeVisible();

    // The bell: open it, read the notice, and the number goes down; mark all read clears it.
    await page.getByTestId('notices-bell').click();
    await expect(page.getByTestId('notices-panel')).toBeVisible();
    await page.getByTestId('notice-Test message from ZestPoint').first().click();
    await expect(page.getByTestId('notices-panel')).toHaveCount(0);
    await expect.poll(() => unread(page)).toBe(before);
    await page.getByTestId('msg-test-InApp').click();                                      // one more unread, so there is something to mark
    await expect.poll(() => unread(page)).toBe(before + 1);
    await page.getByTestId('notices-bell').click();
    await page.getByTestId('notices-read-all').click();
    await expect.poll(() => unread(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('notices-panel')).toHaveCount(0);
  });
});

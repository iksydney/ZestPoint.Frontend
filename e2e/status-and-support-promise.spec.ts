import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi } from './helpers';

const OPERATOR_EMAIL = 'operator@zestpoint.e2e';
const OPERATOR_PASSWORD = 'Operat0r-E2E-Passw0rd!';

async function newCompany(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

async function operatorSignIn(page: Page) {
  await page.goto('/platform/login');
  await page.getByTestId('platform-email').fill(OPERATOR_EMAIL);
  await page.getByTestId('platform-password').fill(OPERATOR_PASSWORD);
  await page.getByTestId('platform-submit').click();
  await expect(page).toHaveURL(/\/platform\/overview$/);
}

async function openCompany(page: Page, slug: string) {
  await page.getByTestId('nav-tenants').click();
  await page.getByTestId('tenant-search').fill(slug);
  await page.getByTestId('tenant-find').click();
  await page.getByTestId(`tenant-${slug}`).getByRole('link').first().click();
  await expect(page.getByTestId('detail-subscription')).toBeVisible();
}

const random = () => Math.random().toString(36).slice(2, 7);

test.describe('The status page and the support promise (enterprise programme, piece 12)', () => {
  test('the status page says plainly that nothing has been measured, and an incident shows on it and inside the app until it is resolved', async ({ page, browser }) => {
    // The background worker is off in this run, so no check has been made: the page must say so rather than claim all is well.
    const visitor = await newContext(browser);
    await visitor.page.goto('/status');
    await expect(visitor.page.getByTestId('status-overall')).toHaveAttribute('data-level', 'Unknown');
    await expect(visitor.page.getByTestId('status-level-signin')).toHaveText(/Not checked lately/);
    await expect(visitor.page.getByTestId('status-availability-signin')).toContainText('No figure yet');
    await expect(visitor.page.getByTestId('status-bars-signin')).toHaveAttribute('aria-label', /90 days with no checks/);
    await expect(visitor.page.locator('[data-testid^="status-part-"]')).toHaveCount(7);
    await expect(visitor.page.getByTestId('status-method')).toContainText('If this page cannot be reached at all, the service is down.');

    // The page is reachable from the sign-in page and from the public site's footer.
    await visitor.page.goto('/login');
    await visitor.page.getByTestId('login-status-link').click();
    await expect(visitor.page).toHaveURL(/\/status$/);
    await visitor.page.goto('/');
    await visitor.page.getByRole('link', { name: 'System status' }).click();
    await expect(visitor.page).toHaveURL(/\/status$/);

    await newCompany(page);
    const operator = await newContext(browser);
    await operatorSignIn(operator.page);
    const op = operator.page;
    await op.getByTestId('nav-status').click();
    await expect(op).toHaveURL(/\/platform\/status$/);
    await expect(op.getByTestId('checks-table')).toBeVisible();
    await expect(op.getByTestId('check-level-till')).toHaveText(/Not checked lately/);

    // Post an incident: the button waits for a title, a part and some words.
    const title = `Live screens slow ${random()}`;
    await expect(op.getByTestId('incident-post')).toBeDisabled();
    await op.getByTestId('incident-title').fill(title);
    await op.getByTestId('incident-part-live').check();
    await op.getByTestId('incident-part-messaging').check();
    await op.getByTestId('incident-message').fill('We are looking into it.');
    await op.getByTestId('incident-post').click();
    const card = op.locator('article').filter({ hasText: title });
    await expect(card.getByTestId('incident-row-status')).toHaveText('Investigating');

    // The public page and the banner inside a company's application show it.
    await visitor.page.goto('/status');
    const open = visitor.page.getByTestId('status-open-incident').filter({ hasText: title });
    await expect(open).toContainText('Live updates, Messaging');
    await expect(open).toContainText('We are looking into it.');
    await expect(visitor.page.getByTestId('status-overall')).toHaveAttribute('data-level', 'Down');
    await page.reload();
    await expect(page.getByTestId('status-banner').filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId('status-banner-link')).toHaveAttribute('href', '/status');

    // Updated and resolved in steps; each one is on the page, and a resolved incident leaves the banner and moves to the last 30 days.
    await card.getByTestId('update-open').click();
    await card.getByTestId('update-status').selectOption('Monitoring');
    await expect(card.getByTestId('update-send')).toBeDisabled();
    await card.getByTestId('update-message').fill('A fix is in; we are watching it.');
    await card.getByTestId('update-send').click();
    await expect(card.getByTestId('incident-row-status')).toHaveText('Fixed, watching');
    await visitor.page.reload();
    await expect(visitor.page.getByTestId('status-open-incident').filter({ hasText: title })).toContainText('A fix is in; we are watching it.');

    await card.getByTestId('update-open').click();
    await card.getByTestId('update-status').selectOption('Resolved');
    await card.getByTestId('update-message').fill('Everything is back.');
    await card.getByTestId('update-send').click();
    await expect(card.getByTestId('incident-row-status')).toHaveText('Resolved');
    await expect(card.getByTestId('update-open')).toHaveCount(0);

    await visitor.page.reload();
    await expect(visitor.page.getByTestId('status-open-incident').filter({ hasText: title })).toHaveCount(0);
    await expect(visitor.page.getByTestId('status-recent')).toContainText(title);
    const summaryRead = page.waitForResponse((r) => r.url().includes('/api/v1/public/status/summary') && r.ok());   // wait for the banner's own question, so "gone" is not judged before it was asked
    await page.reload();
    await summaryRead;
    await expect(page.getByTestId('status-banner').filter({ hasText: title })).toHaveCount(0);

    await operator.context.close();
    await visitor.context.close();
  });

  test('a plan promises reply times and a named contact: the company sees them, its ticket gets a time, and the operator sees it due, answered on time and in the report', async ({ page, browser }) => {
    const who = await newCompany(page);
    const operator = await newContext(browser);
    await operatorSignIn(operator.page);
    const op = operator.page;
    const operatorName = ((await op.getByTestId('operator-name').textContent()) ?? '').trim();

    // The plan editor: the hours are checked, then saved and shown in the list.
    await op.getByTestId('nav-plans').click();
    await op.getByTestId('new-plan').click();
    const code = `promise-${who.slug.slice(-6)}`;
    await op.getByTestId('plan-code').fill(code);
    await op.getByTestId('plan-name').fill('Promise Plan');
    await op.getByTestId('plan-price').fill('2900');
    await op.getByTestId('plan-module-core_pos').check();
    await op.getByTestId('plan-support-normal').fill('240');
    await op.getByTestId('plan-support-urgent').fill('60');
    await op.getByTestId('plan-support-day-32').uncheck();
    await op.getByTestId('plan-support-day-64').uncheck();
    await op.getByTestId('plan-support-from').selectOption('1080');
    await op.getByTestId('plan-support-to').selectOption('480');           // closes before it opens: refused
    await op.getByTestId('plan-support-named').check();
    await op.getByTestId('plan-save').click();
    await expect(op.getByTestId('plan-error')).toContainText('The support hours must end after they start');
    await op.getByTestId('plan-support-from').selectOption('480');
    await op.getByTestId('plan-support-to').selectOption('1080');
    await op.getByTestId('plan-save').click();
    await expect(op.getByTestId(`plan-support-${code}`)).toHaveText('240 / 60 min, Mon Tue Wed Thu Fri 08:00 to 18:00, named contact');

    await openCompany(op, who.slug);
    await op.getByTestId('act-plan').click();
    await op.getByTestId('action-plan').selectOption({ label: 'Promise Plan' });
    await op.getByTestId('action-reason').fill('Support promise pilot');
    await op.getByTestId('action-confirm').click();
    await expect(op.getByTestId('detail-plan')).toHaveText('Promise Plan');

    // The company's Support screen says what its plan promises; the named contact is pending until the operator sets an owner.
    await page.goto('/app/support');
    await expect(page.getByTestId('support-promise')).toContainText('What your Promise Plan plan promises');
    await expect(page.getByTestId('promise-times')).toContainText('within 4 hours');
    await expect(page.getByTestId('promise-times')).toContainText('urgent one within 1 hour');
    await expect(page.getByTestId('promise-times')).toContainText('Monday to Friday, 08:00 to 18:00');
    await expect(page.getByTestId('promise-contact-pending')).toBeVisible();

    await op.getByTestId('nav-customers').click();
    await op.getByTestId('customer-search').fill(who.slug);
    await op.getByTestId('customer-find').click();
    await op.getByTestId(`customer-${who.slug}`).getByRole('link').first().click();
    await op.getByTestId('crm-owner').selectOption({ label: operatorName });
    await op.getByTestId('crm-save').click();
    await page.reload();
    await expect(page.getByTestId('promise-contact')).toContainText(operatorName);
    await expect(page.getByTestId('promise-contact-pending')).toHaveCount(0);

    // A ticket gets a "reply by" time for the company to read.
    const subject = `Printer ${random()}`;
    await page.getByTestId('new-ticket').click();
    await page.getByTestId('new-subject').fill(subject);
    await page.getByTestId('new-body').fill('The bar printer stopped at 6pm.');
    await page.getByTestId('new-send').click();
    await expect(page.getByTestId('thread-due')).toContainText('We aim to reply by');

    // The operator's queue and the ticket show the same time; answering it marks it on time.
    await op.getByTestId('nav-support').click();
    await op.getByTestId('ticket-search').fill(subject);
    await op.getByTestId('ticket-find').click();
    const row = op.getByTestId('ticket-table').locator('tr', { hasText: subject });
    await expect(row).not.toContainText('None promised');
    await row.getByRole('link', { name: subject }).click();
    await expect(op.getByTestId('ticket-due')).not.toContainText('None promised');
    await op.getByTestId('reply-body').fill('Please restart the printer and tell us what you see.');
    await op.getByTestId('reply-send').click();
    await expect(op.getByTestId('ticket-due')).toContainText('Answered on time');

    await page.reload();
    await page.getByTestId('ticket-list').getByRole('button').first().click();
    await expect(page.getByTestId('thread-subject')).toContainText(subject);
    await expect(page.getByTestId('thread-due')).toHaveCount(0);           // answered: nothing left to wait for

    // The monthly report counts it for this plan.
    await op.goto('/platform/support');
    await op.getByTestId('open-response-report').click();
    await expect(op).toHaveURL(/\/platform\/support\/report$/);
    await expect(op.getByTestId('report-table')).toContainText('Promise Plan');
    expect(Number(((await op.getByTestId('sum-ontime').textContent()) ?? '0').trim())).toBeGreaterThanOrEqual(1);
    await expect(op.getByTestId('report-without')).toContainText('ticket(s) this month were on plans that promise no reply time');
    await operator.context.close();
  });
});

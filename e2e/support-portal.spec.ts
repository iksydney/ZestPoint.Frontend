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

async function operatorSignIn(page: Page, email = OPERATOR_EMAIL, password = OPERATOR_PASSWORD) {
  await page.goto('/platform/login');
  await page.getByTestId('platform-email').fill(email);
  await page.getByTestId('platform-password').fill(password);
  await page.getByTestId('platform-submit').click();
  await expect(page).toHaveURL(/\/platform\/overview$/);
}

test.describe('Support, customer records, people and operators on the platform console', () => {
  test('a company raises a ticket, an operator answers with a public reply and a private note, and the company sees only the reply', async ({ page, browser }) => {
    await newCompany(page);
    const subject = `Receipt printer ${Math.random().toString(36).slice(2, 7)}`;

    await page.getByRole('link', { name: 'Support' }).first().click();
    await expect(page).toHaveURL(/\/app\/support$/);
    await page.getByTestId('new-ticket').click();
    await expect(page.getByTestId('new-send')).toBeDisabled();
    await page.getByTestId('new-subject').fill(subject);
    await page.getByTestId('new-category').selectOption('Technical');
    await page.getByTestId('new-body').fill('The printer at the bar stopped printing receipts at 6pm.');
    await page.getByTestId('new-send').click();
    await expect(page.getByTestId('thread-subject')).toContainText(subject);
    await expect(page.getByTestId('thread-status')).toHaveText('Open');

    const operator = await newContext(browser);
    await operatorSignIn(operator.page);
    await operator.page.getByTestId('nav-support').click();
    await operator.page.getByTestId('ticket-search').fill(subject);
    await operator.page.getByTestId('ticket-find').click();
    await operator.page.getByRole('link', { name: subject }).click();
    await expect(operator.page.getByTestId('ticket-title')).toContainText(subject);

    await operator.page.getByTestId('reply-internal').check();
    await operator.page.getByTestId('reply-body').fill('Customer is on the legacy printer driver; escalate to hardware if it repeats.');
    await operator.page.getByTestId('reply-send').click();
    await expect(operator.page.getByTestId('msg-internal')).toContainText('legacy printer driver');

    await operator.page.getByTestId('reply-internal').uncheck();
    await operator.page.getByTestId('reply-body').fill('Please restart the printer and check the paper roll, then tell us what you see.');
    await operator.page.getByTestId('reply-send').click();
    await expect(operator.page.getByTestId('ticket-status')).toHaveText('Waiting for customer');
    await expect(operator.page.getByTestId('msg-operator')).toContainText('restart the printer');
    await expect(operator.page.getByTestId('msg-email')).toContainText('Not sent');     // e-mail is not configured here, and the screen says so
    await operator.page.getByTestId('status-select').selectOption('Open');
    await operator.page.getByTestId('priority-select').selectOption('High');
    await expect(operator.page.getByTestId('ticket-priority-value')).toHaveText('High');

    // The company sees the public reply and never the internal note.
    await page.reload();
    await page.getByTestId('ticket-list').getByRole('button').first().click();
    await expect(page.getByTestId('thread-message').filter({ hasText: 'restart the printer' })).toBeVisible();
    await expect(page.getByTestId('ticket-thread')).not.toContainText('legacy printer driver');
    await page.getByTestId('reply-body').fill('Restarted it and it works now, thank you.');
    await page.getByTestId('reply-send').click();
    await expect(page.getByTestId('thread-status')).toHaveText('Open');
    await page.getByTestId('ticket-close').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('thread-status')).toHaveText('Closed');
    await expect(page.getByTestId('reply-body')).toHaveCount(0);

    await operator.context.close();
  });

  test('an operator keeps a customer record and unlocks a person, every action with a reason', async ({ page, browser }) => {
    const who = await newCompany(page);
    const operator = await newContext(browser);
    await operatorSignIn(operator.page);

    await operator.page.getByTestId('nav-customers').click();
    await operator.page.getByTestId('customer-search').fill(who.slug);
    await operator.page.getByTestId('customer-find').click();
    await expect(operator.page.getByTestId(`customer-${who.slug}`)).toContainText('Trial');   // derived from the free trial until a record is saved
    await operator.page.getByTestId(`customer-${who.slug}`).getByRole('link').first().click();

    await operator.page.getByTestId('crm-stage').selectOption('Onboarding');
    await operator.page.getByTestId('crm-tags').fill('Hotel Group, vip');
    await operator.page.getByTestId('crm-save').click();
    await expect(operator.page.getByTestId('crm-tags')).toHaveValue('hotel-group, vip');
    await operator.page.getByTestId('note-kind').selectOption('Call');
    await operator.page.getByTestId('note-body').fill('Spoke to the GM about a second branch.');
    await operator.page.getByTestId('note-add').click();
    await expect(operator.page.getByTestId('note-list')).toContainText('second branch');

    await operator.page.getByTestId('customer-people').click();
    await expect(operator.page.getByTestId('user-table')).toContainText('Ada Obi');
    await operator.page.getByRole('button', { name: 'Unlock' }).first().click();
    await expect(operator.page.getByTestId('action-confirm')).toBeDisabled();                   // a reason is mandatory
    await operator.page.getByTestId('action-reason').fill('Caller verified by phone');
    await operator.page.getByTestId('action-confirm').click();
    await expect(operator.page.getByTestId('user-notice')).toContainText('Unlocked');
    await operator.page.getByRole('button', { name: 'Send reset link' }).first().click();
    await operator.page.getByTestId('action-reason').fill('Owner forgot the password');
    await operator.page.getByTestId('action-confirm').click();
    await expect(operator.page.getByTestId('user-notice')).toContainText('not configured');     // honest: nothing was e-mailed
    await operator.context.close();
  });

  test('an administrator adds a support agent whose console shows only what the role allows', async ({ browser }) => {
    const admin = await newContext(browser);
    await operatorSignIn(admin.page);
    await admin.page.getByTestId('nav-operators').click();
    await admin.page.getByTestId('op-new').click();
    const email = `agent-${Math.random().toString(36).slice(2, 8)}@zestpoint.e2e`;
    await admin.page.getByTestId('op-name').fill('Agent Ada');
    await admin.page.getByTestId('op-email').fill(email);
    await admin.page.getByTestId('op-role').selectOption('SupportAgent');
    await admin.page.getByTestId('op-password').fill('Agent-Passw0rd-123!');
    await admin.page.getByTestId('op-create').click();
    await expect(admin.page.getByTestId(`op-${email}`)).toContainText('Support agent');

    const agent = await newContext(browser);
    await operatorSignIn(agent.page, email, 'Agent-Passw0rd-123!');
    await expect(agent.page.getByTestId('operator-role')).toContainText('Support agent');
    await expect(agent.page.getByTestId('nav-support')).toBeVisible();
    await expect(agent.page.getByTestId('nav-customers')).toBeVisible();
    await expect(agent.page.getByTestId('nav-users')).toBeVisible();
    await expect(agent.page.getByTestId('nav-operators')).toHaveCount(0);
    // Typing the address in the bar reloads the app and drops the in-memory session, so ask the router for it instead.
    await agent.page.evaluate(() => { history.pushState({}, '', '/platform/operators'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(agent.page).toHaveURL(/\/platform\/overview$/);
    await agent.page.getByTestId('nav-plans').click();
    await expect(agent.page.getByTestId('new-plan')).toHaveCount(0);
    await agent.page.getByTestId('nav-users').click();
    await expect(agent.page.getByTestId('user-table')).toBeVisible();
    await expect(agent.page.getByRole('button', { name: 'Unlock' })).toHaveCount(0);               // people actions need a lead

    // Switching the agent off signs them out of the platform at once.
    await admin.page.getByTestId(`op-toggle-${email}`).click();
    await admin.page.getByTestId('confirm-ok').click();
    await expect(admin.page.getByTestId(`op-${email}`)).toContainText('Switched off');
    await agent.page.getByTestId('nav-support').click();
    await expect(agent.page).toHaveURL(/\/platform\/login$/);                                      // the console returns them to sign-in

    await admin.context.close();
    await agent.context.close();
  });
});

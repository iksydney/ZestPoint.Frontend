import { Page, expect, test } from '@playwright/test';
import { newContext, registerViaUi, openPos } from './helpers';

/**
 * A new branch is not visible to people it was not given to (owner's decision, 2026-11-22). Creating a branch switches the people who worked at "every branch" to the branches they had,
 * then asks the owner who works at the new one: people who already work for the company, or new people created for it. The add-staff form no longer starts with "All branches".
 */

async function ownerAtStaff(page: Page) {
  const who = await registerViaUi(page);
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

/** Adds a person with a PIN. `everyBranch` ticks "All branches" (the form starts with the branch the owner is at instead). Returns the sign-in code. */
async function addPinStaff(page: Page, name: string, roleKey: string, everyBranch: boolean, pin = '7391'): Promise<string> {
  await page.getByTestId('add-staff').click();
  await page.getByTestId('new-name').fill(name);
  await page.getByTestId('new-pin').fill(pin);
  await page.getByTestId(`new-role-${roleKey}`).check();
  if (everyBranch) await page.getByTestId('new-all-branches').check();
  await page.getByTestId('create-staff').click();
  const code = (await page.getByTestId('staff-added-code').innerText()).trim();
  await page.getByTestId('staff-added-done').click();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
  return code;
}

async function pinSignIn(page: Page, slug: string, code: string, pin = '7391') {
  await page.goto('/login');
  await page.getByTestId('login-slug').fill(slug);
  await page.getByTestId('mode-pin').click();
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
}

test.describe('A new branch and who works there', () => {
  test('the add-staff form no longer starts with every branch, the new branch is hidden from people who worked at every branch, and the owner is asked who works there', async ({ page, browser }) => {
    test.slow();
    const who = await ownerAtStaff(page);

    // The form starts with the branch the owner is working at, and "All branches" is a deliberate tick.
    await page.getByTestId('add-staff').click();
    await expect(page.getByTestId('new-all-branches')).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Main branch' })).toBeChecked();
    await page.getByRole('button', { name: 'Cancel' }).first().click();

    // Two people who work at every branch, like everyone in a company with one branch.
    const tunde = await addPinStaff(page, 'Tunde Bello', 'cashier', true);
    const ngozi = await addPinStaff(page, 'Ngozi Eze', 'cashier', true);
    await expect(page.getByRole('row').filter({ hasText: 'Ngozi Eze' })).toContainText('All branches');

    // Add the branch: the window opens at once and lists who was switched to the branches they had.
    await page.goto('/app/settings/branches');
    await page.getByTestId('add-branch').click();
    await page.getByTestId('branch-name').fill('Lekki');
    await page.getByTestId('branch-code').fill('LEK');
    await page.getByTestId('save-branch').click();
    await expect(page.getByTestId('bp-keep')).toBeVisible();
    await expect(page.getByTestId('bp-keep')).toContainText('Tunde Bello');
    await expect(page.getByTestId('bp-keep')).toContainText('Ngozi Eze');
    await page.getByTestId('bp-keep-next').click();                                       // nobody keeps every branch

    // Who works at Lekki: first an existing person, then a new one.
    await expect(page.getByTestId('bp-choose')).toBeVisible();
    await page.getByTestId('bp-existing').click();
    await page.getByTestId('bp-search').fill('tunde');
    await expect(page.getByTestId('bp-person-Ngozi Eze')).toHaveCount(0);                 // the search narrows the list
    await page.getByTestId('bp-person-Tunde Bello').check();
    await page.getByTestId('bp-save-existing').click();
    await expect(page.getByTestId('bp-summary')).toContainText('Added: Tunde Bello');

    await page.getByTestId('bp-new').click();
    await page.getByTestId('bp-create').click();                                          // nothing typed: refused in plain words
    await expect(page.getByTestId('bp-new-step')).toContainText('Type their name.');
    await expect(page.getByTestId('bp-new-step')).toContainText('Choose at least one role.');
    await expect(page.getByTestId('bp-new-step')).toContainText('Type a PIN of 4 to 12 digits');
    await page.getByTestId('bp-new-name').fill('Chidi Okafor');
    await page.getByTestId('bp-role-cashier').check();
    await page.getByTestId('bp-new-pin').fill('5827');
    await page.getByTestId('bp-create').click();
    await expect(page.getByTestId('bp-summary')).toContainText('Created: Chidi Okafor');
    await page.getByTestId('bp-done').click();
    await expect(page.getByTestId('branch-people')).toHaveCount(0);

    // The staff list tells the same story.
    await page.goto('/app/staff');
    await expect(page.getByRole('row').filter({ hasText: 'Tunde Bello' })).toContainText('Lekki');
    await expect(page.getByRole('row').filter({ hasText: 'Ngozi Eze' })).not.toContainText('Lekki');
    await expect(page.getByRole('row').filter({ hasText: 'Chidi Okafor' })).toContainText('Lekki');

    // Tunde (added) chooses between two branches; Ngozi (not added) sees one branch and has no choice.
    const tundeSide = await newContext(browser);
    await pinSignIn(tundeSide.page, who.slug, tunde);
    await expect(tundeSide.page).toHaveURL(/\/app\/dashboard$/);
    await openPos(tundeSide.page);
    await expect(tundeSide.page.getByTestId('branch-picker')).toBeVisible();
    await tundeSide.context.close();

    const ngoziSide = await newContext(browser);
    await pinSignIn(ngoziSide.page, who.slug, ngozi);
    await expect(ngoziSide.page).toHaveURL(/\/app\/dashboard$/);
    await openPos(ngoziSide.page);
    await expect(ngoziSide.page.getByTestId('branch-name')).toHaveText('Main branch');
    await expect(ngoziSide.page.getByTestId('branch-picker')).toHaveCount(0);
    await ngoziSide.context.close();
  });

  test('the owner can keep someone at every branch, skip the window, and come back to it from the branch', async ({ page, browser }) => {
    test.slow();
    const who = await ownerAtStaff(page);
    const ada = await addPinStaff(page, 'Ada Accounts', 'cashier', true);

    await page.goto('/app/settings/branches');
    await page.getByTestId('add-branch').click();
    await page.getByTestId('branch-name').fill('Ikeja');
    await page.getByTestId('branch-code').fill('IKJ');
    await page.getByTestId('save-branch').click();
    await page.getByTestId('bp-keep-Ada Accounts').check();                              // an accountant who should still see every branch
    await page.getByTestId('bp-keep-next').click();
    await expect(page.getByTestId('bp-summary')).toContainText('Every branch again: Ada Accounts');
    await page.getByTestId('bp-done').click();

    // Ada works at every branch again, so she sees Ikeja without being added.
    const side = await newContext(browser);
    await pinSignIn(side.page, who.slug, ada);
    await expect(side.page).toHaveURL(/\/app\/dashboard$/);
    await openPos(side.page);
    await expect(side.page.getByTestId('branch-picker')).toBeVisible();
    await side.context.close();

    // A window that is skipped can be opened again from the branch's own row.
    await page.goto('/app/settings/branches');
    await page.getByTestId('branch-staff-IKJ').click();
    await expect(page.getByTestId('bp-choose')).toBeVisible();
    await expect(page.getByTestId('bp-done')).toHaveText('Skip for now');
    await page.getByTestId('bp-done').click();
  });
});

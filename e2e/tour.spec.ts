import { Page, expect, test } from '@playwright/test';
import { TOURS, TourDefinition, stepsSince } from '../src/app/core/tour/tours';
import { newContext, registerViaUi, startShiftWhenAsked } from './helpers';

/**
 * The guided tours. A new person is shown round the application the first time they sign in, and round a main screen the first time
 * they open it; what they have seen is kept on their account. Every tour is walked here on the real screens: a step that points at
 * something that is no longer there fails this test, which is what keeps the tours in step with the application (owner's rule,
 * 2026-11-14; see core/tour/tours.ts).
 *
 * Tours do not start by themselves in the other browser tests; this one switches that on for itself.
 */

async function toursOn(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('zp.tours.auto', 'on'); } catch { /* ignore */ } });
}

async function ownerInApp(page: Page, barManMethod = false) {
  const who = await registerViaUi(page, barManMethod ? { type: 'Nightclub', barManMethod } : {});
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

/** Steps through the tour on screen to its end and returns the names of the steps that were shown. Fails on any step that was missing. */
async function walk(page: Page, tour: TourDefinition): Promise<string[]> {
  const host = page.getByTestId('tour');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-tour-key', tour.key);
  const shown: string[] = [];
  for (let guard = 0; guard < tour.steps.length + 2; guard++) {
    await expect(page.getByTestId('tour-title')).toBeVisible();
    const id = (await host.getAttribute('data-tour-step'))!;
    shown.push(id);
    const step = tour.steps.find((s) => s.id === id)!;
    await expect(page.getByTestId('tour-title'), `${tour.key}/${id}`).toHaveText(step.title);
    await expect(page.getByTestId('tour-body'), `${tour.key}/${id}`).toHaveText(step.body);
    // The card is inside the window, whatever it is pointing at. It slides to its place when the step changes, so it is looked at once it has settled.
    const view = page.viewportSize()!;
    const card = page.getByRole('dialog', { name: step.title });
    const edges = async () => { const b = (await card.boundingBox())!; return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height }; };
    await expect.poll(async () => (await edges()).left, { message: `${tour.key}/${id} left` }).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await edges()).top, { message: `${tour.key}/${id} top` }).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await edges()).right, { message: `${tour.key}/${id} right` }).toBeLessThanOrEqual(view.width + 1);
    await expect.poll(async () => (await edges()).bottom, { message: `${tour.key}/${id} bottom` }).toBeLessThanOrEqual(view.height + 1);
    expect(await host.getAttribute('data-tour-missing'), `${tour.key}: a step points at something that is not on screen`).toBe('');

    const last = (await page.getByTestId('tour-next').innerText()).trim() === 'Done';
    await page.getByTestId('tour-next').click();
    if (last) break;
    await expect(host).not.toHaveAttribute('data-tour-step', id);
  }
  await expect(host).toHaveCount(0);
  return shown;
}

test.describe('Guided tours', () => {
  test('a new person is shown round on first sign-in and on each main screen once, and it is remembered on their account', async ({ page, browser }) => {
    await toursOn(page);
    const who = await ownerInApp(page);
    const app = TOURS.find((t) => t.key === 'app')!;

    // The tour of the application starts by itself. The owner of a new company sees every area, so every step is shown.
    const host = page.getByTestId('tour');
    await expect(host).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('tour-progress')).toHaveText(`1 of ${app.steps.length}`);
    // Nothing behind the tour can be used while it runs, and Back goes back.
    await page.getByTestId('tour-next').click();
    await expect(host).toHaveAttribute('data-tour-step', 'menu');
    await page.getByTestId('tour-back').click();
    await expect(host).toHaveAttribute('data-tour-step', 'welcome');
    // Finishing saves to the account in the background; wait for that to land before reloading, as a person would (they never reload in the same instant).
    const saved = page.waitForResponse((r) => r.url().includes('/api/v1/me/tours/app') && r.request().method() === 'PUT');
    expect(await walk(page, app)).toEqual(app.steps.map((s) => s.id));
    expect((await saved).ok()).toBe(true);

    // Seen is seen: it does not start again on a reload, nor in another browser (it is kept on the account, not in this browser).
    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(host).toHaveCount(0);

    // The first visit to a main screen starts that screen's tour. Leaving it early also counts as seen.
    await page.goto('/app/pos');
    await expect(host).toBeVisible({ timeout: 15_000 });
    await expect(host).toHaveAttribute('data-tour-key', 'pos');
    const posSaved = page.waitForResponse((r) => r.url().includes('/api/v1/me/tours/pos') && r.request().method() === 'PUT');
    await page.keyboard.press('Escape');
    await expect(host).toHaveCount(0);
    expect((await posSaved).ok()).toBe(true);
    await page.goto('/app/dashboard');
    await page.goto('/app/pos');
    await expect(page.getByTestId('product-search')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(host).toHaveCount(0);

    // Help takes any tour again; "Show me every tour again" forgets what was seen.
    await page.getByTestId('help-open').click();
    await expect(page.getByTestId('help-tour-screen')).toContainText('The till');
    await page.getByTestId('help-tour-screen').click();
    await walk(page, TOURS.find((t) => t.key === 'pos')!);
    await page.getByTestId('help-open').click();
    const forgotten = page.waitForResponse((r) => r.url().includes('/api/v1/me/tours') && r.request().method() === 'DELETE');
    await page.getByTestId('help-tours-reset').click();
    expect((await forgotten).ok()).toBe(true);
    await page.goto('/app/customers');
    await expect(host).toBeVisible({ timeout: 15_000 });
    await expect(host).toHaveAttribute('data-tour-key', 'app');                           // the tour of the application comes first again
    const appSkipped = page.waitForResponse((r) => r.url().includes('/api/v1/me/tours/app') && r.request().method() === 'PUT');
    await page.getByTestId('tour-skip').click();
    await expect(host).toHaveCount(0);
    expect((await appSkipped).ok()).toBe(true);

    // A cashier gets the same tour without the areas they do not have, and nothing is counted as missing for them.
    await page.goto('/app/staff');
    await page.getByTestId('add-staff').click();
    await page.getByTestId('new-name').fill('Cash Only');
    await page.getByTestId('new-pin').fill('7391');
    await page.getByTestId('new-role-cashier').check();
    await page.getByTestId('create-staff').click();
    const code = (await page.getByTestId('staff-added-code').innerText()).trim();
    const staff = await newContext(browser);
    await toursOn(staff.page);
    await staff.page.goto('/login');
    await staff.page.getByTestId('login-slug').fill(who.slug);
    await staff.page.getByTestId('mode-pin').click();
    await staff.page.getByTestId('login-code').fill(code);
    await staff.page.getByTestId('login-pin').fill('7391');
    await staff.page.getByTestId('login-submit').click();
    await startShiftWhenAsked(staff.page);                                              // the tour waits until the shift is started
    await expect(staff.page.getByTestId('tour')).toBeVisible({ timeout: 15_000 });
    const cashierSteps = await walk(staff.page, app);
    expect(cashierSteps).toContain('sell');
    expect(cashierSteps).toContain('search');
    expect(cashierSteps).not.toContain('admin');
    expect(cashierSteps).not.toContain('finance');
    await staff.context.close();
  });

  test('every tour is in step with its screen: each step points at something that is there', async ({ page }) => {
    test.setTimeout(240_000);
    await ownerInApp(page, true);                                                          // tours do not start by themselves here: each is asked for; this company uses stations, so the kitchen display is in its menu
    for (const tour of TOURS) {
      if (tour.nav) {
        const entry = page.locator(`[data-testid="main-nav"] [data-nav="${tour.nav}"]`);
        if (await entry.count()) {
          await entry.click();
          // The screen asked for is the one on show before its tour is asked for (the heading of the last screen is not enough).
          await expect(entry.first(), tour.key).toHaveAttribute('aria-current', 'page');
        } else {
          // A set-up screen or a report is not in the menu: it is opened from its area's Set-up or Reports page, as a person would.
          const viaReports = tour.nav.includes('.report.');
          const card = page.locator(`[data-testid="hub-list"] [data-nav="${tour.nav}"]`);
          for (const setup of await page.locator(`[data-testid="main-nav"] [data-nav^="${viaReports ? 'reports.' : 'setup.'}"]`).all()) {
            await setup.click();
            await expect(page.getByTestId('hub-list'), tour.key).toBeVisible();
            if (await card.count()) break;
          }
          await card.click();
          await expect(page.getByTestId('hub-list'), tour.key).toHaveCount(0);
          await expect(page.locator('[data-testid="main-nav"] [aria-current="page"]'), tour.key).toHaveAttribute('data-nav', viaReports ? /^reports\./ : /^setup\./);
        }
        await expect(page.locator('main h1').first(), tour.key).toBeVisible();
      } else await page.goto('/app/dashboard');
      await page.getByTestId('help-open').click();
      await page.getByTestId(tour.nav ? 'help-tour-screen' : 'help-tour-app').click();
      // For the owner of a new company with every module, every step of every tour is there, optional or not.
      expect(await walk(page, tour), tour.key).toEqual(tour.steps.map((s) => s.id));
    }
  });

  test('on a phone the menu opens for the steps that are about it, and the card stays on screen', async ({ page }) => {
    await ownerInApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/dashboard');
    await page.getByTestId('help-open').click();
    await page.getByTestId('help-tour-app').click();
    const host = page.getByTestId('tour');
    await expect(host).toHaveAttribute('data-tour-step', 'welcome');
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
    await page.getByTestId('tour-next').click();
    await expect(host).toHaveAttribute('data-tour-step', 'menu');
    await expect(page.getByTestId('nav-drawer')).toBeVisible();                           // the menu is a drawer on a phone: opened for this step
    const app = TOURS.find((t) => t.key === 'app')!;
    await page.getByTestId('tour-back').click();
    expect(await walk(page, app)).toEqual(app.steps.map((s) => s.id));
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);                          // and closed again afterwards
  });

  test('someone who took an earlier version of a tour is shown only what changed', () => {
    const step = (id: string) => ({ id, title: id, body: id });
    const tour: TourDefinition = {
      key: 'example', title: 'Example', version: 3, steps: [step('a'), step('b'), step('c')],
      changes: [{ version: 2, steps: [step('moved')] }, { version: 3, steps: [step('new-1'), step('new-2')] }]
    };
    expect(stepsSince(tour, null).map((s) => s.id)).toEqual(['a', 'b', 'c']);              // never took it: the whole tour as it now stands
    expect(stepsSince(tour, 1).map((s) => s.id)).toEqual(['moved', 'new-1', 'new-2']);     // took version 1: everything since
    expect(stepsSince(tour, 2).map((s) => s.id)).toEqual(['new-1', 'new-2']);
    expect(stepsSince(tour, 3)).toEqual([]);                                                // up to date: nothing
    // Every tour that has moved past its first version says what changed in each one.
    for (const t of TOURS) expect((t.changes ?? []).map((c) => c.version), t.key).toEqual(Array.from({ length: t.version - 1 }, (_, i) => i + 2));
  });
});

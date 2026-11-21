import { Page, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MANUAL, ROLES, manualPlainText, screenshotIds } from '../src/app/features/help/manual.content';
import { registerViaUi } from './helpers';

/**
 * The manual: the Help screen (/app/help), the page the PDF is printed from (/manual-print) and the words they share (manual.content.ts).
 * Pictures are taken by manual-screenshots.spec.ts into public/manual/img, and the PDF is made by scripts/build-manual-pdf.mjs: these tests
 * check that both are there, that nothing in the manual is broken, and that it can be read on a phone and in a dark theme.
 */

async function ownerInApp(page: Page, type = 'Restaurant') {
  const who = await registerViaUi(page, { type });
  await page.getByTestId('save-continue').click();
  await page.getByTestId('go-staff').click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  return who;
}

/** WCAG contrast of the words in an element against the colours really behind them (every layer blended, a canvas used to read any colour format). */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Nothing matches ${sel}`);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const rgba = (c: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const layers: [number, number, number, number][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    let bg: [number, number, number] = [255, 255, 255];
    for (const l of layers.reverse()) bg = [0, 1, 2].map((i) => l[i]! * l[3] + bg[i]! * (1 - l[3])) as [number, number, number];
    const fg = rgba(getComputedStyle(el).color);
    const text = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]));
    const lum = (c: number[]): number => { const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
    const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

/** Every heading in the order it appears: there is one h1, and a heading never skips a level going down. */
async function expectHeadingsInOrder(page: Page, within: string): Promise<void> {
  const levels = await page.evaluate((sel) => [...(document.querySelector(sel)?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])].map((h) => Number(h.tagName.slice(1))), within);
  expect(levels.length).toBeGreaterThan(2);
  expect(levels.filter((l) => l === 1).length, 'exactly one h1').toBe(1);
  expect(levels[0], 'the first heading is the h1').toBe(1);
  levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1]!, `heading ${i} (h${l}) after h${levels[i - 1]}`).toBeLessThanOrEqual(1); });
}

test.describe('The manual content (no browser)', () => {
  test('chapters and sections have unique addresses, every section says something, and every picture it names exists', () => {
    const chapterIds = MANUAL.map((c) => c.id);
    expect(new Set(chapterIds).size, 'chapter ids are unique').toBe(chapterIds.length);
    const sectionIds = MANUAL.flatMap((c) => c.sections.map((s) => s.id));
    expect(new Set(sectionIds).size, 'section ids are unique across the manual').toBe(sectionIds.length);
    for (const id of sectionIds) expect(chapterIds, `a section id must not be a chapter id: ${id}`).not.toContain(id);
    for (const c of MANUAL) {
      expect(c.sections.length, `${c.id} has sections`).toBeGreaterThan(0);
      for (const s of c.sections) expect(s.blocks.length, `${s.id} has blocks`).toBeGreaterThan(0);
    }
    for (const id of screenshotIds()) expect(existsSync(join(__dirname, '..', 'public', 'manual', 'img', `${id}.png`)), `public/manual/img/${id}.png exists`).toBe(true);
  });

  test('every job has a chapter, the manual covers the four things asked for, and it is written in plain words', () => {
    for (const r of ROLES) expect(MANUAL.some((c) => c.roles !== 'all' && c.roles.includes(r.id)), `a chapter for ${r.label}`).toBe(true);
    const titles = MANUAL.map((c) => c.title.toLowerCase()).join(' | ');
    for (const part of ['how it all connects', 'first day', 'owner', 'manager', 'cashier', 'waiter', 'kitchen and bar', 'store keeper', 'accountant', 'a day in the kitchen', 'the phone app', 'when something looks wrong', 'glossary', 'questions people ask', 'does not do yet']) {
      expect(titles, `a chapter about "${part}"`).toContain(part);
    }
    const text = manualPlainText();
    // Words a person running a bar should never have to meet (a gloss is written where one cannot be avoided).
    for (const term of ['API', 'JSON', 'SQL', 'endpoint', 'middleware', 'tenant', 'GUID', 'idempotent', 'SignalR', 'Firebase', 'FCM', 'migration', 'backend', 'frontend', 'localStorage', 'TODO', 'FIXME', 'lorem']) {
      expect(new RegExp(`\\b${term}\\b`, 'i').test(text), `the manual must not use "${term}"`).toBe(false);
    }
    expect(/[\w.+-]+@[\w-]+\.[\w.]+/.test(text), 'no e-mail address appears in the manual').toBe(false);
    expect(/\b(password|pin)\s*[:=]\s*\S+/i.test(text), 'no secret is written in the manual').toBe(false);
  });
});

test.describe('The manual in ZestPoint', () => {
  test('Help opens it, the contents list every chapter, a chapter shows its title, and the PDF link points at a real PDF', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.getByTestId('help-open').click();
    const item = page.getByTestId('help-manual');
    await expect(item).toBeVisible();
    await expect(item).toContainText('The manual');
    await expect(item).toContainText('How everything works and connects');
    await item.click();
    await expect(page).toHaveURL(/\/app\/help$/);
    await expect(page.getByTestId('help-title')).toHaveText('The ZestPoint manual');

    // The contents list every chapter, in order, and the first chapter is open.
    const toc = page.getByTestId('help-toc');
    for (const c of MANUAL) await expect(toc.getByTestId(`help-toc-${c.id}`)).toContainText(c.title);
    await expect(page.getByTestId('help-chapter-title')).toHaveText(MANUAL[0]!.title);

    await page.getByTestId('help-toc-cashier').click();
    await expect(page).toHaveURL(/\/app\/help\/cashier$/);
    await expect(page.getByTestId('help-chapter-title')).toHaveText('For the cashier');
    await expect(page.getByTestId('help-audience')).toContainText('Cashier');
    await expect(page.getByTestId('help-next')).toBeVisible();
    await expect(page.getByTestId('help-prev')).toBeVisible();

    // An address that is not a chapter says so plainly instead of showing nothing.
    await page.goto('/app/help/no-such-chapter');
    await expect(page.getByTestId('help-unknown')).toContainText('There is no chapter called "no-such-chapter"');

    // The PDF link points at a file that exists and is a PDF.
    const link = page.getByTestId('help-pdf');
    await expect(link).toHaveAttribute('href', '/manual/ZestPoint-Manual.pdf');
    await expect(link).toHaveAttribute('download', /\.pdf$/);
    const response = await page.request.get('/manual/ZestPoint-Manual.pdf');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('pdf');
    const body = await response.body();
    expect(body.length, 'a real PDF is more than a few kilobytes').toBeGreaterThan(20_000);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('search narrows the sections and says plainly when nothing matches; a job narrows the contents; a section link opens its section', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    await page.goto('/app/help');
    const toc = page.getByTestId('help-toc');
    const all = MANUAL.length;
    await expect(toc.locator('a[data-testid^="help-toc-"]:not([data-testid^="help-toc-section-"])')).toHaveCount(all);

    // A word narrows the list to the sections that mention it.
    await page.getByTestId('help-search').fill('expiry');
    await expect(page.getByTestId('help-result-count')).toContainText('match');
    const narrowed = await toc.locator('a[data-testid^="help-toc-"]:not([data-testid^="help-toc-section-"])').count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(all);
    await expect(page.getByTestId('help-content')).toContainText(/expiry/i);
    // Every word must be there, in any order.
    await page.getByTestId('help-search').fill('expiry shelf');
    await expect(page.getByTestId('help-section-kd-receive')).toBeVisible();

    // Nothing matches: it says so, plainly, and the contents say so too.
    await page.getByTestId('help-search').fill('zzzqqqxx');
    await expect(page.getByTestId('help-no-match')).toContainText('No section matches "zzzqqqxx"');
    await expect(page.getByTestId('help-result-count')).toContainText('Nothing matches');
    await expect(page.getByTestId('help-toc-empty')).toBeVisible();
    await page.getByTestId('help-no-match-clear').click();
    await expect(page.getByTestId('help-search')).toHaveValue('');
    await expect(page.getByTestId('help-no-match')).toHaveCount(0);
    await expect(toc.getByTestId(`help-toc-${MANUAL[0]!.id}`)).toBeVisible();

    // A job chip narrows the contents to the chapters written for it (and those for everyone), and pressing it again undoes it.
    await page.getByTestId('help-role-store').click();
    await expect(page.getByTestId('help-role-store')).toHaveAttribute('aria-pressed', 'true');
    await expect(toc.getByTestId('help-toc-store-keeper')).toBeVisible();
    await expect(toc.getByTestId('help-toc-accountant')).toHaveCount(0);
    await expect(toc.getByTestId('help-toc-cashier')).toHaveCount(0);
    await expect(toc.getByTestId('help-toc-connects')).toBeVisible();          // for everyone
    await expect(page.getByTestId('help-chapter-title')).toBeVisible();
    await page.getByTestId('help-role-store').click();
    await expect(toc.getByTestId('help-toc-accountant')).toBeVisible();
    await page.getByTestId('help-role-cashier').click();
    await expect(toc.getByTestId('help-toc-cashier')).toBeVisible();
    await expect(toc.getByTestId('help-toc-store-keeper')).toHaveCount(0);
    // Opening a chapter keeps the job that was picked.
    await toc.getByTestId('help-toc-cashier').click();
    await expect(page).toHaveURL(/\/app\/help\/cashier$/);
    await expect(page.getByTestId('help-role-cashier')).toHaveAttribute('aria-pressed', 'true');
    await expect(toc.getByTestId('help-toc-store-keeper')).toHaveCount(0);
    await page.getByTestId('help-role-all').click();
    await expect(toc.getByTestId('help-toc-store-keeper')).toBeVisible();

    // A link to a section opens that chapter and brings the section to the top of the screen.
    await page.goto('/app/help/kitchen-day#kd-expiry');
    const section = page.getByTestId('help-section-kd-expiry');
    await expect(section).toBeVisible();
    await expect(section).toBeInViewport();
    await expect(section.getByRole('heading', { level: 3 })).toContainText('Expiry alerts');
    // The link beside a section's title carries the address to copy.
    await expect(page.getByTestId('help-anchor-kd-expiry')).toHaveAttribute('href', /\/app\/help\/kitchen-day#kd-expiry$/);
    // The contents of the open chapter list its sections, each a link.
    await page.getByTestId('help-toc-section-kd-batches').click();
    await expect(page).toHaveURL(/\/app\/help\/kitchen-day#kd-batches$/);
    await expect(page.getByTestId('help-section-kd-batches')).toBeInViewport();
  });

  test('every picture in the manual loads, in the Help screen and on the page the PDF is printed from; the two pages carry the same chapters', async ({ page }) => {
    test.slow();
    const expected = MANUAL.flatMap((c) => c.sections.flatMap((s) => s.blocks)).filter((b) => b.kind === 'screenshot').length;
    expect(expected).toBeGreaterThan(20);

    await page.goto('/manual-print');
    await expect(page.getByTestId('manual-print')).toBeVisible();
    await expect(page.getByTestId('manual-cover')).toBeVisible();
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), undefined, { timeout: 60_000 });
    const pictures = await page.evaluate(() => [...document.images].map((i) => ({ src: i.getAttribute('src') ?? '', ok: i.naturalWidth > 0, alt: i.alt })));
    expect(pictures.length).toBe(expected);
    expect(pictures.filter((p) => !p.ok).map((p) => p.src), 'pictures that did not load').toEqual([]);
    expect(pictures.filter((p) => p.alt.trim().length < 20).map((p) => p.src), 'pictures with no real description').toEqual([]);
    await expect(page.locator('article[data-chapter]')).toHaveCount(MANUAL.length);
    await expect(page.locator('[data-toc-page]')).toHaveCount(MANUAL.length);
    await expectHeadingsInOrder(page, '[data-testid="manual-print"]');

    // The same pictures in the Help screen: open every chapter that has one and look at them.
    await ownerInApp(page);
    for (const c of MANUAL.filter((m) => m.sections.some((s) => s.blocks.some((b) => b.kind === 'screenshot')))) {
      await page.goto(`/app/help/${c.id}`);
      await expect(page.getByTestId('help-chapter-title')).toHaveText(c.title);
      const images = page.locator('[data-testid="help-content"] img');
      const n = await images.count();
      expect(n, `pictures in ${c.id}`).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) await images.nth(i).scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="help-content"] img')].every((i) => (i as HTMLImageElement).complete), undefined, { timeout: 20_000 });
      const broken = await images.evaluateAll((list) => list.filter((i) => (i as HTMLImageElement).naturalWidth === 0).map((i) => i.getAttribute('src')));
      expect(broken, `broken pictures in ${c.id}`).toEqual([]);
      await expect(page.locator('[data-testid="help-content"] .blk-missing')).toHaveCount(0);
    }
  });

  test('the headings of every chapter are in order, and both pictures (diagrams) are drawn with a description', async ({ page }) => {
    test.slow();
    await ownerInApp(page);
    for (const c of MANUAL) {
      await page.goto(`/app/help/${c.id}`);
      await expect(page.getByTestId('help-chapter-title')).toHaveText(c.title);
      await expectHeadingsInOrder(page, '[data-testid="help"]');
    }
    await page.goto('/app/help/connects');
    for (const id of ['connect', 'journey']) {
      const svg = page.getByTestId(`diagram-${id}`);
      await expect(svg).toBeVisible();
      expect(((await svg.getAttribute('aria-label')) ?? '').length, `the ${id} diagram has a description`).toBeGreaterThan(80);
    }
  });

  test('a phone can read it: no sideways scrolling in any chapter, the contents fold away, and the controls can be pressed', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 320, height: 640 });
    await ownerInApp(page);
    await page.goto('/app/help');
    await expect(page.getByTestId('help-toc')).toBeHidden();
    await page.getByTestId('help-toc-toggle').click();
    await expect(page.getByTestId('help-toc')).toBeVisible();
    for (const c of MANUAL) await expect(page.getByTestId(`help-toc-${c.id}`)).toBeVisible();
    await page.getByTestId('help-toc-first-day').click();
    await expect(page.getByTestId('help-chapter-title')).toHaveText(MANUAL.find((c) => c.id === 'first-day')!.title);
    await expect(page.getByTestId('help-toc')).toBeHidden();

    const sideways = async (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const c of MANUAL) {
      await page.goto(`/app/help/${c.id}`);
      await expect(page.getByTestId('help-chapter-title')).toBeVisible();
      expect(await sideways(), `${c.id} scrolls sideways on a phone`).toBeLessThanOrEqual(0);
    }
    // Searching and picking a job work with a thumb: the search result list does not push the page sideways either.
    await page.goto('/app/help');
    await page.getByTestId('help-search').fill('payment');
    await expect(page.getByTestId('help-result-count')).toContainText('match');
    expect(await sideways()).toBeLessThanOrEqual(0);
    for (const sel of ['help-role-owner', 'help-pdf', 'help-search']) {
      const box = await page.getByTestId(sel).boundingBox();
      expect(box?.height ?? 0, `${sel} is tall enough to press`).toBeGreaterThanOrEqual(36);
    }
  });

  test('in a dark theme the manual is readable: words, contents, notes, tables and chips all have the contrast the rules ask for', async ({ page }) => {
    test.slow();
    await ownerInApp(page, 'Nightclub');                              // its theme preset has a dark background
    await page.goto('/app/help/troubleshooting');
    await expect(page.getByTestId('help-chapter-title')).toBeVisible();
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    expect(Number(canvas.split(/\s+/)[0]), `the theme under test is dark (canvas ${canvas})`).toBeLessThan(80);
    for (const [what, selector] of [['a paragraph', '.blk-p'], ['a table cell', '.blk-table td'], ['a table heading', '.blk-table th'], ['the contents', '.toc-link'], ['a chip', '.chip:not(.chip-on)'], ['the section title', '.section-title']] as const) {
      expect(await contrastOf(page, selector), `${what} in the dark theme`).toBeGreaterThanOrEqual(4.5);
    }
    await page.goto('/app/help/phone');
    await expect(page.getByTestId('help-chapter-title')).toBeVisible();
    expect(await contrastOf(page, '.blk-note-label'), 'a note\'s label').toBeGreaterThanOrEqual(4.5);
    await page.goto('/app/help/connects');
    await expect(page.getByTestId('diagram-connect')).toBeVisible();
    const svgText = await page.getByTestId('diagram-connect').locator('text.line').first().evaluate((el) => getComputedStyle(el).fill);
    expect(svgText, 'diagram writing is drawn in the theme\'s text colour, not a fixed dark one').not.toBe('rgb(0, 0, 0)');
  });

  test('in a light theme the same things are readable too', async ({ page }) => {
    test.slow();
    await ownerInApp(page, 'Restaurant');                             // its theme preset is light
    await page.goto('/app/help/troubleshooting');
    await expect(page.getByTestId('help-chapter-title')).toBeVisible();
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-rgb').trim());
    expect(Number(canvas.split(/\s+/)[0]), `the theme under test is light (canvas ${canvas})`).toBeGreaterThan(180);
    for (const selector of ['.blk-p', '.blk-table td', '.blk-table th', '.toc-link', '.chip:not(.chip-on)', '.section-title']) {
      expect(await contrastOf(page, selector), selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('printing the manual page: the whole book is on one page in print order, with a cover and contents', async ({ page }) => {
    await page.goto('/manual-print');
    await expect(page.getByTestId('manual-toc')).toBeVisible();
    for (const c of MANUAL) await expect(page.getByTestId('manual-toc')).toContainText(c.title);
    await page.goto('/manual-print?only=cashier');
    await expect(page.locator('article[data-chapter]')).toHaveCount(1);
    await expect(page.getByTestId('manual-cover')).toHaveCount(0);
    await page.goto('/manual-print?only=front');
    await expect(page.locator('article[data-chapter]')).toHaveCount(0);
    await expect(page.getByTestId('manual-cover')).toBeVisible();
  });

  test('somebody who is not signed in is asked to sign in before the manual in the application opens', async ({ page }) => {
    await page.goto('/app/help');
    await expect(page).toHaveURL(/\/login/);
  });
});

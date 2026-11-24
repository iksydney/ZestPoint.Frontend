import { Page, expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerViaUi, startShiftWhenAsked } from './helpers';

/**
 * A sweep of every screen for the faults a person sees: errors in the browser console, requests the server refused, a page that scrolls sideways, and controls or headings that sit
 * on top of each other (the "Open bills" buttons squeezed into the heading was the one that prompted it, 2026-11-22).
 *
 * It registers a company with demonstration data, finds the screens by following the links of the side menu and of each page it opens (plus the menu's own routes), then visits each at
 * a desktop and at a phone width. It does NOTHING unless HEALTH_SWEEP=1 (it is long), and it writes what it found to test-results/health-sweep.json.
 *
 *   PowerShell:  $env:HEALTH_SWEEP = '1'; npx playwright test e2e/health-sweep.spec.ts
 */

interface Finding { readonly route: string; readonly width: number; readonly kind: string; readonly detail: string }

/** Console messages that are the browser's or a dependency's own noise and say nothing about the application. */
const IGNORED_CONSOLE = [/favicon/i, /Download the React DevTools/i, /\[vite\]/i, /ERR_BLOCKED_BY_CLIENT/i, /Autofocus processing was blocked/i,
  // The browser's own line for a refused request carries no address. A 401 on a sign-in call is expected (signed out), and any other refused request is reported with its address by the 'response' listener below.
  /Failed to load resource: the server responded with a status of 401/i];

/** A refused request that the application expects (signed out, or a feature the plan does not include). */
const EXPECTED_STATUS = (url: string, status: number): boolean => status === 401 && /\/api\/v1\/auth\//.test(url);

function menuRoutes(): string[] {
  const text = readFileSync('src/app/core/navigation/app-nav.ts', 'utf8');
  return [...text.matchAll(/route:\s*'(\/app\/[^']+)'/g)].map((m) => m[1]!).filter((r) => !r.includes(':'));
}

/** What is wrong with the page as it stands: overflow sideways, controls on top of each other, a heading's words under a control. Runs inside the page. */
async function inspect(page: Page): Promise<{ kind: string; detail: string }[]> {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const describe = (el: Element): string => {
      const t = (el as HTMLElement).dataset?.['testid'];
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `<${el.tagName.toLowerCase()}${t ? ` data-testid=${t}` : ''}>${text ? ` "${text}"` : ''}`;
    };
    // What sits inside a closed <details> (the reports' "Columns" list) is not on the page, although the browser still gives it a box: only its <summary> is.
    const inClosedDetails = (el: Element): boolean => {
      const d = el.closest('details:not([open])');
      return !!d && el.closest('summary')?.parentElement !== d;
    };
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !el.closest('[hidden],[aria-hidden="true"]') && !inClosedDetails(el);
    };
    const floating = (el: Element): boolean => { for (let e: Element | null = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
    const hit = (a: DOMRect, b: DOMRect): number => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

    // Sideways scroll: what pokes out on the right.
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) {
      const wide = [...document.querySelectorAll('body *')].filter((e) => shown(e) && !floating(e) && e.getBoundingClientRect().right > vw + 1 && !e.closest('.overflow-x-auto,.overflow-auto,.overflow-hidden,[class*="overflow-x"]'))
        .slice(0, 3).map(describe);
      out.push({ kind: 'sideways-scroll', detail: `the page is ${document.documentElement.scrollWidth}px wide in a ${vw}px window${wide.length ? `; poking out: ${wide.join(' | ')}` : ''}` });
    }

    const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=combobox], [role=button], [role=tab]')].filter((e) => shown(e) && !floating(e));
    // Controls on top of each other.
    for (let i = 0; i < controls.length; i++) {
      const a = controls[i]!; const ra = a.getBoundingClientRect();
      for (let j = i + 1; j < controls.length; j++) {
        const b = controls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const la = a.closest('label'); if (la && la === b.closest('label')) continue;
        const overlap = hit(ra, b.getBoundingClientRect());
        if (overlap > 12) out.push({ kind: 'controls-overlap', detail: `${describe(a)} and ${describe(b)} overlap by ${Math.round(overlap)}px2` });
      }
    }
    // A heading's or label's words under a control.
    const words = [...document.querySelectorAll('h1,h2,h3,h4,legend,label,th')].filter((e) => shown(e) && !floating(e));
    for (const w of words) {
      const range = document.createRange(); range.selectNodeContents(w);
      const lines = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
      for (const c of controls) {
        if (w.contains(c) || c.contains(w)) continue;
        const rc = c.getBoundingClientRect();
        const overlap = lines.reduce((sum, r) => sum + hit(r, rc), 0);
        if (overlap > 12) out.push({ kind: 'words-under-control', detail: `${describe(w)} is under ${describe(c)} (${Math.round(overlap)}px2)` });
      }
    }
    return out.slice(0, 12);
  });
}

test.describe('Health sweep', () => {
  test.skip(!process.env['HEALTH_SWEEP'], 'Runs only with HEALTH_SWEEP=1');

  test('every screen at a desktop and a phone width: no console errors, no refused requests, no sideways scroll, nothing on top of anything', async ({ page }) => {
    test.setTimeout(45 * 60 * 1000);
    const findings: Finding[] = [];
    let current = { route: 'setup', width: 1280 };
    const note = (kind: string, detail: string): void => { findings.push({ ...current, kind, detail }); };

    page.on('console', (m) => { if (m.type() === 'error' && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) note('console-error', m.text().slice(0, 300)); });
    page.on('pageerror', (e) => note('page-error', e.message.slice(0, 300)));
    page.on('response', (r) => { if (r.status() >= 400 && !EXPECTED_STATUS(r.url(), r.status())) note('refused-request', `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });

    // A company with demonstration data, signed in as its owner.
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    await page.goto('/app/settings/operations');
    await page.getByTestId('seed-demo').click();
    await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);

    const visit = async (route: string): Promise<string[]> => {
      current = { route, width: current.width };
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      for (const f of await inspect(page)) note(f.kind, f.detail);
      // Where this page leads.
      return page.evaluate(() => [...document.querySelectorAll('a[href^="/app/"]')].map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('#')[0]!.split('?')[0]!));
    };

    // The Point of Sale holds the owner (who sells too) at the Start your shift box until a shift is started, which would hide the till itself from the sweep.
    // So the box is looked at on its own, at both widths, and the shift is started: the till is then swept like every other screen.
    await visit('/app/pos');
    await expect(page.getByTestId('shift-box')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 800 });
    current = { route: '/app/pos (the shift box)', width: 390 };
    for (const f of await inspect(page)) note(f.kind, f.detail);
    await page.setViewportSize({ width: 1280, height: 800 });
    current = { route: 'setup', width: 1280 };
    await startShiftWhenAsked(page);

    // Desktop pass: follow the menu and every link found, so reports and hubs are reached too.
    const seen = new Set<string>();
    const queue = ['/app/dashboard', '/app/help', ...menuRoutes()];
    const dynamic = /\/(:|[0-9a-f]{8}-[0-9a-f]{4})/;
    while (queue.length > 0 && seen.size < 220) {
      const route = queue.shift()!;
      if (seen.has(route) || dynamic.test(route)) continue;
      seen.add(route);
      // Open every collapsed menu group first, once, so its links are found.
      if (seen.size === 1) {
        await page.goto('/app/dashboard');
        for (const t of await page.locator('nav [aria-expanded="false"]').all()) await t.click().catch(() => undefined);
        for (const href of await page.evaluate(() => [...document.querySelectorAll('nav a[href^="/app/"]')].map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('#')[0]!.split('?')[0]!))) queue.push(href);
      }
      for (const next of await visit(route)) if (!seen.has(next)) queue.push(next);
    }

    // Phone pass: the same screens, narrow.
    await page.setViewportSize({ width: 390, height: 800 });
    current = { route: 'phone', width: 390 };
    for (const route of seen) await visit(route);

    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/health-sweep.json', JSON.stringify({ screens: [...seen], findings }, null, 2));
    const lines = findings.map((f) => `${f.width}px ${f.route}  ${f.kind}: ${f.detail}`);
    console.log(`Health sweep: ${seen.size} screens, ${findings.length} findings\n${lines.join('\n')}`);
    expect(lines, `Findings (also in test-results/health-sweep.json):\n${lines.join('\n')}`).toEqual([]);
  });
});

/**
 * Builds public/manual/ZestPoint-Manual.pdf from the SAME text the Help screen shows.
 *
 * The page it prints is the application's own /manual-print route (src/app/features/help/manual-print.component.ts), which draws
 * manual.content.ts through the same block renderer as /app/help. So there is no second copy of the words: change the content and run this again.
 *
 *   npm run manual:pdf                      starts its own dev server (the e2e configuration, port 4311) and stops it when done
 *   MANUAL_BASE_URL=http://localhost:4200 npm run manual:pdf     uses a server that is already running
 *
 * The browser is Microsoft Edge (the same one the browser tests use); set MANUAL_BROWSER to another Playwright channel to change it.
 *
 * The contents page needs page numbers, which only the browser knows. Each chapter is printed on its own (after one blank page, so its pages are
 * laid out exactly as in the whole book), its pages are counted, and the starting page of every chapter is worked out from the cover and contents
 * pages plus the chapters before it. The whole book is then printed with those numbers filled in, and its page count is checked against the sum.
 */
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public', 'manual', 'ZestPoint-Manual.pdf');
const PORT = 4311;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(url) {
  try { return (await fetch(url)).ok; } catch { return false; }
}

/** The number of pages of a PDF made by the browser: the largest /Count of its page tree, which is the total. */
function countPages(buffer) {
  const text = buffer.toString('latin1');
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const fromKids = [...text.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map((m) => Number(m[1]));
  const all = [...counts, ...fromKids];
  if (all.length) return Math.max(...all);
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

let server = null;
async function startServer() {
  const configured = process.env.MANUAL_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const base = `http://localhost:${PORT}`;
  if (await reachable(base)) return base;
  console.log(`Starting the dev server on ${base} (the first build takes a minute or two)...`);
  server = spawn('npx', ['ng', 'serve', '--configuration', 'e2e', '--port', String(PORT), '--no-live-reload'], { cwd: root, shell: true, stdio: 'ignore', env: { ...process.env, NG_CLI_ANALYTICS: 'false', NG_DISABLE_VERSION_CHECK: '1' } });
  const until = Date.now() + 5 * 60_000;
  while (Date.now() < until) {
    if (await reachable(base)) return base;
    await sleep(2000);
  }
  throw new Error('The dev server did not start within five minutes.');
}

function stopServer() {
  if (!server?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
}

async function main() {
  const base = await startServer();
  const browser = await chromium.launch({ channel: process.env.MANUAL_BROWSER ?? 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));

  /** Opens /manual-print (all of it, or ?only=...), waits until every picture is in, and prints it. `tocPages` fills the contents. */
  async function print(query, tocPages) {
    await page.goto(`${base}/manual-print${query}`, { waitUntil: 'load' });
    await page.getByTestId('manual-print').waitFor({ state: 'visible', timeout: 60_000 });
    await page.emulateMedia({ media: 'print' });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), undefined, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.getAttribute('src')));
    if (broken.length) problems.push(`pictures that did not load: ${broken.join(', ')}`);
    if (tocPages) await page.evaluate((map) => document.querySelectorAll('[data-toc-page]').forEach((e) => { e.textContent = String(map[e.getAttribute('data-toc-page')] ?? ''); }), tocPages);
    return page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  }

  try {
    await page.goto(`${base}/manual-print`, { waitUntil: 'load' });
    await page.getByTestId('manual-print').waitFor({ state: 'visible', timeout: 120_000 });
    const chapterIds = await page.evaluate(() => [...document.querySelectorAll('article[data-chapter]')].map((a) => a.getAttribute('data-chapter')));
    if (!chapterIds.length) throw new Error('The manual page drew no chapters.');

    const frontPages = countPages(await print('?only=front')) - 1; // minus the marker page that ends the cover and contents
    const chapterPages = {};
    for (const id of chapterIds) chapterPages[id] = countPages(await print(`?only=${encodeURIComponent(id)}`)) - 1; // minus the blank first page

    const tocPages = {};
    let next = frontPages + 1;
    for (const id of chapterIds) { tocPages[id] = next; next += chapterPages[id]; }
    const expected = next - 1;

    const book = await print('', tocPages);
    const pages = countPages(book);
    if (pages !== expected) problems.push(`the book has ${pages} pages but the chapters add up to ${expected}: the contents page numbers may be off`);

    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, book);
    console.log(`Wrote ${OUT}`);
    console.log(`${pages} pages, ${(book.length / 1024).toFixed(0)} KB; cover and contents ${frontPages} page(s); ${chapterIds.length} chapters.`);
    for (const id of chapterIds) console.log(`  page ${String(tocPages[id]).padStart(3)}  ${id}`);
  } finally {
    await browser.close();
    stopServer();
  }
  if (problems.length) { console.error(`\nProblems:\n- ${problems.join('\n- ')}`); process.exitCode = 1; }
}

main().catch((e) => { stopServer(); console.error(e); process.exit(1); });

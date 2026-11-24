/**
 * Shared pieces of the browser tests (`tests/web/*.web.ts`): starting the built app in headless Chrome, and the few
 * things every test does to a page (wait for text, click a button, tap the board).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, type Browser, type Page } from 'puppeteer-core';
import { initialViewport } from '../../src/go/viewport';
import { allPoints, boardDims, openEdges, parseSgf, type Point } from '../../src/sgf/parser';
import { findChrome } from '../../scripts/lib/chrome';
import { buildWeb, clickText, serveDir, sleep } from '../../scripts/lib/web';

export { sleep };

/** Pass as the `skip` option of `describe`: browser tests are skipped, not failed, where Chrome is missing. */
export const skipWithoutChrome = findChrome() ? false : 'Chrome not found (set CHROME_PATH)';

export interface Site {
  /** The served app. */
  url: string;
  browser: Browser;
  /** Shut everything down and delete the build. */
  close: () => Promise<void>;
}

/** Build the web app, serve it and start headless Chrome. `name` only labels the temporary build folder. */
export async function startSite(name: string): Promise<Site> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `go-${name}-`));
  const removeBuild = () => fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  let server: Awaited<ReturnType<typeof serveDir>> | undefined;
  try {
    buildWeb(outDir);
    server = await serveDir(outDir);
    const browser = await launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
    const served = server;
    return {
      url: served.url,
      browser,
      close: async () => {
        await browser.close();
        served.close();
        removeBuild();
      },
    };
  } catch (e) {
    server?.close();
    removeBuild();
    throw e;
  }
}

export interface App extends Site {
  page: Page;
  /** Uncaught errors the page threw; tests assert this is empty at the end. */
  errors: string[];
}

export interface AppOptions {
  /** Phone-sized by default. */
  viewport?: { width: number; height: number };
  /** Puzzles put in the library on a fresh profile (a profile that already has a library keeps it). */
  library?: object[];
  /** Runs before the app opens, for anything else the page needs set up first. */
  prepare?: (page: Page) => Promise<void>;
}

/** Start the app in one page with a fresh profile, and open it. */
export async function startApp(name: string, options: AppOptions = {}): Promise<App> {
  const site = await startSite(name);
  try {
    const page = await site.browser.newPage();
    const errors: string[] = [];
    await page.setViewport(options.viewport ?? { width: 390, height: 1000 });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (options.library) {
      await page.evaluateOnNewDocument((lib) => {
        if (!localStorage.getItem('library.v1')) localStorage.setItem('library.v1', JSON.stringify(lib));
      }, options.library);
    }
    await options.prepare?.(page);
    await page.goto(site.url, { waitUntil: 'networkidle0' });
    await sleep(700);
    return { ...site, page, errors };
  } catch (e) {
    await site.close();
    throw e;
  }
}

export const bodyText = (page: Page) => page.evaluate('document.body.innerText') as Promise<string>;

const matches = (text: string, needle: string | RegExp) =>
  typeof needle === 'string' ? text.includes(needle) : needle.test(text);

/** Wait until the page text contains `needle`; on timeout fail with what the page does say. */
export async function expectText(page: Page, needle: string | RegExp, ms = 6000) {
  const end = Date.now() + ms;
  let t = '';
  while (Date.now() < end) {
    t = await bodyText(page);
    if (matches(t, needle)) return t;
    await sleep(150);
  }
  assert.fail(`expected the page to show ${needle}, but it shows:\n${t.slice(0, 700)}`);
}

export async function expectNoText(page: Page, needle: string | RegExp) {
  await sleep(250);
  const t = await bodyText(page);
  assert.ok(!matches(t, needle), `expected the page NOT to show ${needle}, but it shows:\n${t.slice(0, 700)}`);
}

/** Click the button with this text. */
export async function click(page: Page, text: string) {
  assert.ok(
    await clickText(page, text, 450),
    `no button "${text}" on screen:\n${(await bodyText(page)).slice(0, 500)}`,
  );
}

/** Click the control with this aria-label. */
export async function clickAria(page: Page, label: string) {
  const ok = await page.evaluate(
    `(() => { const e = document.querySelector('[aria-label=${JSON.stringify(label)}]'); if (!e) return false; e.click(); return true; })()`,
  );
  assert.ok(ok, `no control labelled "${label}" on screen`);
  await sleep(450);
}

/** Tap a board point of the puzzle `sgf` (the page's transparent rects, in row order over the visible window). */
export async function tapBoard(page: Page, sgf: string, p: Point) {
  const root = parseSgf(sgf);
  const v = initialViewport(allPoints(root), boardDims(root), openEdges(root));
  const idx = (p.y - v.y0) * (v.x1 - v.x0 + 1) + (p.x - v.x0);
  const box = (await page.evaluate(
    `(() => { const r = [...document.querySelectorAll('svg rect')].filter((e) => e.getAttribute('fill') === 'transparent')[${idx}];
      if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`,
  )) as { x: number; y: number } | null;
  assert.ok(box, 'the board has tap targets');
  await page.mouse.click(box.x, box.y);
  await sleep(450);
}

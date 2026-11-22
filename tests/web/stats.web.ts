/**
 * Browser test for the tile stats: hovering a tile (or long-pressing it) shows the puzzle's stats in every mode.
 * Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launch, type Browser, type Page } from 'puppeteer-core';
import { SAMPLES } from '../../src/data/samples';
import { findChrome } from '../../scripts/lib/chrome';
import { buildWeb, clickText, serveDir, sleep } from '../../scripts/lib/web';

const chromePath = findChrome();
const FIRST = SAMPLES[0];

const bodyText = (page: Page) => page.evaluate('document.body.innerText') as Promise<string>;

async function expectText(page: Page, needle: string | RegExp, ms = 4000) {
  const end = Date.now() + ms;
  let t = '';
  while (Date.now() < end) {
    t = await bodyText(page);
    if (typeof needle === 'string' ? t.includes(needle) : needle.test(t)) return t;
    await sleep(120);
  }
  assert.fail(`expected the page to show ${needle}, but it shows:\n${t.slice(0, 600)}`);
}

/** The middle of the first tile's title. */
const titleBox = (page: Page) =>
  page.evaluate(
    `(() => { const e = [...document.querySelectorAll('div, span')].find((x) => !x.children.length && x.innerText === ${JSON.stringify(FIRST.title)});
      const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`,
  ) as Promise<{ x: number; y: number }>;

describe('tile stats in the browser', { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' }, () => {
  let outDir = '';
  let site: { url: string; close: () => void };
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];

  before(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-stats-'));
    buildWeb(outDir);
    site = await serveDir(outDir);
    browser = await launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 900 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(site.url, { waitUntil: 'networkidle0' });
    await sleep(700);
    assert.ok(await clickText(page, 'Browse', 500));
  });

  after(async () => {
    await browser?.close();
    site?.close();
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('shows the stats for every mode while the pointer is over a tile', async () => {
    const { x, y } = await titleBox(page);
    await page.mouse.move(x, y);
    const t = await expectText(page, 'Joseki mode');
    for (const s of ['Spaced repetition', 'Guided learning', 'Not added', 'Both sides: Off'])
      assert.ok(t.includes(s), s);
    await page.mouse.move(2, 2);
    await sleep(300);
    assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="Puzzle stats"]').length`), 0);
  });

  it('shows them in a sheet after a long press', async () => {
    const { x, y } = await titleBox(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await sleep(700);
    await page.mouse.up();
    await expectText(page, FIRST.title);
    await expectText(page, 'Reviews');
    assert.ok(await clickText(page, 'Close', 400));
    await page.mouse.move(2, 2);
    await sleep(300);
    assert.doesNotMatch(await bodyText(page), /Both sides/);
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

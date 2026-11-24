/**
 * The color flip is decided when a puzzle opens and stays put while the mode changes between Hints, Solve and
 * Explore. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launch, type Browser, type Page } from 'puppeteer-core';
import { findChrome } from '../../scripts/lib/chrome';
import { buildWeb, clickText, serveDir, sleep } from '../../scripts/lib/web';

const chromePath = findChrome();
// three black stones and one white one, so a flip shows as the counts swapping
const PUZZLE = { id: 'c-flip', title: 'Flip line', sgf: '(;GM[1]SZ[9]PL[B]AB[aa][bb][cc]AW[dd](;B[ee]TE[1]))' };

const bodyText = (page: Page) => page.evaluate('document.body.innerText') as Promise<string>;

async function expectText(page: Page, needle: string, ms = 6000) {
  const end = Date.now() + ms;
  let t = '';
  while (Date.now() < end) {
    t = await bodyText(page);
    if (t.includes(needle)) return t;
    await sleep(150);
  }
  assert.fail(`expected the page to show "${needle}", but it shows:\n${t.slice(0, 700)}`);
}

async function click(page: Page, text: string) {
  assert.ok(
    await clickText(page, text, 600),
    `no button "${text}" on screen:\n${(await bodyText(page)).slice(0, 500)}`,
  );
}

const stones = (page: Page) =>
  page.evaluate(
    `({ black: document.querySelectorAll('circle[fill="#111"]').length, white: document.querySelectorAll('circle[fill="#f6f6f2"]').length })`,
  ) as Promise<{ black: number; white: number }>;

describe('the color flip', { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' }, () => {
  let outDir = '';
  let site: { url: string; close: () => void };
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];

  before(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-flip-'));
    buildWeb(outDir);
    site = await serveDir(outDir);
    browser = await launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 700, height: 1100 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument(
      (lib) => {
        // the app draws a random number to decide the flip: 0.1 flips, anything above 0.5 does not
        (window as unknown as { __roll: number }).__roll = 0.1;
        Math.random = () => (window as unknown as { __roll: number }).__roll;
        if (!localStorage.getItem('library.v1')) localStorage.setItem('library.v1', JSON.stringify(lib));
      },
      [PUZZLE],
    );
    await page.goto(site.url, { waitUntil: 'networkidle0' });
    await sleep(700);
  });

  after(async () => {
    await browser?.close();
    site?.close();
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('changing the mode keeps the colors chosen when the puzzle opened', async () => {
    await click(page, 'Browse');
    await expectText(page, PUZZLE.title);
    await page.evaluate(`document.querySelector('[aria-label="Play ${PUZZLE.title}"]').click()`);
    await expectText(page, 'Explore');
    assert.deepEqual(await stones(page), { black: 1, white: 3 }, 'the random draw flipped the colors');
    // every new random draw now says "do not flip"; the colors must not follow it
    await page.evaluate('window.__roll = 0.9');
    for (const mode of ['Hints', 'Explore', 'Solve', 'Explore', 'Hints']) {
      await click(page, mode);
      await sleep(400);
      assert.deepEqual(await stones(page), { black: 1, white: 3 }, `still flipped after switching to ${mode}`);
    }
  });

  it('a puzzle opened again gets a new draw', async () => {
    await click(page, '‹ Back');
    await expectText(page, PUZZLE.title);
    await page.evaluate(`document.querySelector('[aria-label="Play ${PUZZLE.title}"]').click()`);
    await expectText(page, 'Explore');
    assert.deepEqual(await stones(page), { black: 3, white: 1 }, 'the new draw (0.9) did not flip');
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

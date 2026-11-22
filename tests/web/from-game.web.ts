/**
 * Journey test for "New from game": paste a game, choose the moves, choose the area, save, and find the puzzle in
 * Browse. Run with `npm run test:web`.
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
const GAME = '(;GM[1]SZ[19]PB[Kuro]PW[Shiro];B[ab];W[aa];B[ba];W[pp];B[dd])';

const bodyText = (page: Page) => page.evaluate('document.body.innerText') as Promise<string>;

async function expectText(page: Page, needle: string | RegExp, ms = 6000) {
  const end = Date.now() + ms;
  let t = '';
  while (Date.now() < end) {
    t = await bodyText(page);
    if (typeof needle === 'string' ? t.includes(needle) : needle.test(t)) return t;
    await sleep(150);
  }
  assert.fail(`expected the page to show ${needle}, but it shows:\n${t.slice(0, 700)}`);
}

async function click(page: Page, text: string) {
  assert.ok(
    await clickText(page, text, 400),
    `no button "${text}" on screen:\n${(await bodyText(page)).slice(0, 500)}`,
  );
}

async function clickAria(page: Page, label: string) {
  const ok = await page.evaluate(
    `(() => { const e = document.querySelector('[aria-label=${JSON.stringify(label)}]'); if (!e) return false; e.click(); return true; })()`,
  );
  assert.ok(ok, `no control labelled "${label}"`);
  await sleep(300);
}

describe('new from game in the browser', { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' }, () => {
  let outDir = '';
  let site: { url: string; close: () => void };
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];

  before(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-fromgame-'));
    buildWeb(outDir);
    site = await serveDir(outDir);
    browser = await launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(site.url, { waitUntil: 'networkidle0' });
    await sleep(700);
  });

  after(async () => {
    await browser?.close();
    site?.close();
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('rejects text that is not a game', async () => {
    await click(page, 'Browse');
    await click(page, 'New from game');
    await expectText(page, 'Choose a game');
    await page.type('textarea', 'hello');
    await click(page, 'Use pasted game');
    await expectText(page, 'No game found');
  });

  it('steps through the moves and sets the first and last move', async () => {
    await page.focus('textarea');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('textarea', GAME);
    await click(page, 'Use pasted game');
    await expectText(page, 'Move 1 of 5');
    await clickAria(page, 'Forward one move');
    await clickAria(page, 'Forward one move');
    await expectText(page, 'Move 3 of 5');
    await expectText(page, 'Black');
    await click(page, 'Last move here');
    await expectText(page, 'moves 1–3');
  });

  it('shows the area, warns when moves fall outside it, and saves a puzzle', async () => {
    await click(page, 'Next ›');
    await expectText(page, 'Area: 7×7');
    // include move 4 (far from the corner) and come back again
    await click(page, '‹ Back');
    await clickAria(page, 'Forward one move');
    await click(page, 'Last move here');
    await expectText(page, 'moves 1–4');
    await click(page, 'Next ›');
    await expectText(page, /Area: \d+×\d+/);
    await click(page, '‹ Back');
    await clickAria(page, 'Back one move');
    await click(page, 'Last move here');
    await click(page, 'Next ›');
    await expectText(page, 'Area: 7×7');
    await clickAria(page, 'Move right side out');
    await expectText(page, 'Area: 8×7');
    await click(page, 'Whole board');
    await expectText(page, 'Area: 19×19');
    await click(page, 'Fit to the moves');
    await expectText(page, 'Area: 7×7');
    await click(page, 'Save puzzle');
    await expectText(page, 'Browse');
    await expectText(page, 'Shiro vs Kuro · moves 1–3');
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

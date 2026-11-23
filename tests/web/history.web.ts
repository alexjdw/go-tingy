/**
 * Journey test for the browser history: the Back and Forward buttons move along the app's screens.
 * Run with `npm run test:web`.
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
const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc];W[rc];B[sd];W[se])';
const PUZZLE = { id: 'c-history', title: 'History line', sgf: SGF };

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
    await clickText(page, text, 450),
    `no button "${text}" on screen:\n${(await bodyText(page)).slice(0, 500)}`,
  );
}

async function clickAria(page: Page, label: string) {
  const ok = await page.evaluate(
    `(() => { const e = document.querySelector('[aria-label=${JSON.stringify(label)}]'); if (!e) return false; e.click(); return true; })()`,
  );
  assert.ok(ok, `no control labelled "${label}"`);
  await sleep(450);
}

describe(
  'the browser Back and Forward buttons',
  { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' },
  () => {
    let outDir = '';
    let site: { url: string; close: () => void };
    let browser: Browser;
    let page: Page;
    const errors: string[] = [];

    before(async () => {
      outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-history-'));
      buildWeb(outDir);
      site = await serveDir(outDir);
      browser = await launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
      page = await browser.newPage();
      await page.setViewport({ width: 390, height: 1000 });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.evaluateOnNewDocument(
        (lib) => {
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

    const nav = async (js: string) => {
      await page.evaluate(js);
      await sleep(700);
    };

    it('Back returns through the screens, Forward comes back', async () => {
      await expectText(page, 'How do you want to study?');
      await click(page, 'Browse');
      await expectText(page, PUZZLE.title);
      await clickAria(page, `Play ${PUZZLE.title}`);
      await expectText(page, 'Joseki mode');
      await nav('history.back()');
      await expectText(page, 'New from game');
      await nav('history.back()');
      await expectText(page, 'How do you want to study?');
      await nav('history.forward()');
      await expectText(page, PUZZLE.title);
      await nav('history.forward()');
      await expectText(page, 'Joseki mode');
    });

    it('the in-app Back button and the browser agree', async () => {
      await click(page, '‹ Back');
      await expectText(page, PUZZLE.title);
      await nav('history.forward()');
      await expectText(page, 'Joseki mode');
      await nav('history.back()');
      await nav('history.back()');
      await expectText(page, 'How do you want to study?');
    });

    it('opening a new screen drops the forward entries', async () => {
      await click(page, 'Browse');
      await nav('history.back()');
      await click(page, 'Settings');
      await nav('history.forward()');
      assert.doesNotMatch(await bodyText(page), /New from game/);
      await nav('history.back()');
      await expectText(page, 'How do you want to study?');
    });

    it('does not leave the app from the first screen', async () => {
      await expectText(page, 'How do you want to study?');
      assert.equal(await page.evaluate('location.pathname'), '/');
    });

    it('threw no errors', () => {
      assert.deepEqual(errors, []);
    });
  },
);

/**
 * Journey test for collections: importing several puzzles asks for a collection name, collections hold folders,
 * and a collection can be renamed. Run with `npm run test:web`.
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
const SGF = (n: number) => `(;GM[1]SZ[9]PL[B]AB[a${'abcdefghi'[n]}]AW[bb](;B[cc]))`;
const SEEDED = [
  { id: 'c-1', title: 'Peep one', sgf: SGF(0), collection: 'Tesuji', folder: 'Part 1/Peep' },
  { id: 'c-2', title: 'Clamp one', sgf: SGF(1), collection: 'Tesuji', folder: 'Part 1/Clamp' },
  { id: 'c-3', title: 'Dent one', sgf: SGF(2), collection: 'Tesuji', folder: 'Part 2' },
];

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

/** Replace the text of the input with this aria-label. */
async function typeInto(page: Page, label: string, text: string) {
  const sel = `[aria-label=${JSON.stringify(label)}]`;
  await page.waitForSelector(sel);
  await page.click(sel, { count: 3 });
  await page.keyboard.press('Backspace');
  await page.type(sel, text);
  await sleep(200);
}

describe('collections', { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' }, () => {
  let outDir = '';
  let site: { url: string; close: () => void };
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];

  before(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-collections-'));
    buildWeb(outDir);
    site = await serveDir(outDir);
    browser = await launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 700, height: 1100 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument((lib) => {
      if (!localStorage.getItem('library.v1')) localStorage.setItem('library.v1', JSON.stringify(lib));
    }, SEEDED);
    await page.goto(site.url, { waitUntil: 'networkidle0' });
    await sleep(700);
    await click(page, 'Browse');
  });

  after(async () => {
    await browser?.close();
    site?.close();
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('opens folders inside a collection and goes back up', async () => {
    await click(page, 'Tesuji (3)');
    await expectText(page, 'Part 1 (2)');
    await click(page, 'Part 1 (2)');
    await expectText(page, 'Peep (1)');
    await expectText(page, 'Clamp (1)');
    assert.doesNotMatch(await bodyText(page), /Dent one/);
    await click(page, 'Peep (1)');
    await expectText(page, 'Peep one');
    assert.doesNotMatch(await bodyText(page), /Clamp one/);
    await clickAria(page, 'Up one folder');
    await expectText(page, 'Clamp one');
  });

  it('asks for a collection name when several puzzles are imported', async () => {
    await click(page, 'All puzzles');
    await clickAria(page, 'Import SGF files');
    await page.type('textarea', `${SGF(3)} ${SGF(4)} ${SGF(5)}`);
    await click(page, 'Add pasted text');
    await expectText(page, '3 found');
    await click(page, 'Import 3');
    await expectText(page, 'Name this collection');
    await typeInto(page, 'Collection name', 'My new set');
    await click(page, 'Import 3');
    await expectText(page, 'My new set (3)');
    await expectText(page, 'Tesuji (3)');
  });

  it('a single puzzle is imported without asking', async () => {
    await clickAria(page, 'Import SGF files');
    await page.type('textarea', SGF(6));
    await click(page, 'Add pasted text');
    await click(page, 'Import 1');
    await expectText(page, '11 puzzles');
    assert.doesNotMatch(await bodyText(page), /Name this collection/);
  });

  it('renames a collection', async () => {
    await click(page, 'My new set (3)');
    await click(page, 'Rename collection');
    await typeInto(page, 'Collection name', 'Renamed set');
    await click(page, 'Save name');
    await expectText(page, 'Renamed set (3)');
    assert.doesNotMatch(await bodyText(page), /My new set/);
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

/**
 * Journey test for guided learning runs: the first-time tutorial, then clicking through the given moves (both sides)
 * on the green dot, then finishing alone. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launch, type Browser, type Page } from 'puppeteer-core';
import { initialViewport } from '../../src/go/viewport';
import { allPoints, boardDims, openEdges, parseSgf, type Point } from '../../src/sgf/parser';
import { findChrome } from '../../scripts/lib/chrome';
import { buildWeb, clickText, serveDir, sleep } from '../../scripts/lib/web';

const chromePath = findChrome();
const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc];W[rc];B[sd];W[se])';
const PUZZLE = { id: 'c-follow', title: 'Long line', sgf: SGF };

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

/** Tap a board point (the page's transparent rects, in row order over the visible window). */
async function tapBoard(page: Page, p: Point) {
  const root = parseSgf(SGF);
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

const pt = (s: string): Point => ({ x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 });

describe(
  'following the given moves in a guided run',
  { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' },
  () => {
    let outDir = '';
    let site: { url: string; close: () => void };
    let browser: Browser;
    let page: Page;
    const errors: string[] = [];

    before(async () => {
      outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-follow-'));
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

    it('shows the tutorial once, then has you click the given moves for both sides', async () => {
      await click(page, 'Browse');
      await clickAria(page, `Add ${PUZZLE.title} to a study mode`);
      await click(page, 'Add to guided learning');
      await click(page, 'Close');
      await click(page, '‹ Back');
      await click(page, 'Guided Learning');
      await click(page, 'Play');
      await expectText(page, 'Guided learning · 2 free moves');
      await expectText(page, 'Follow the green dot');
      await click(page, 'Skip'); // the first-time tutorial
      await expectText(page, 'Follow the green dot');
      // a click off the dot does nothing
      await tapBoard(page, pt('sd'));
      await expectText(page, 'Follow the green dot');
      for (const p of ['pd', 'qf', 'qc', 'rc']) {
        await expectText(page, 'Follow the green dot');
        await tapBoard(page, pt(p));
      }
      await expectText(page, /You play (Black|White)/);
      await tapBoard(page, pt('sd'));
      await expectText(page, /Clean run|cleared|Done|Solved/);
    });

    it('does not show the tutorial again', async () => {
      await page.reload({ waitUntil: 'networkidle0' });
      await sleep(700);
      await click(page, 'Guided Learning');
      await click(page, 'Play');
      await expectText(page, 'Guided learning');
      assert.doesNotMatch(await bodyText(page), /How guided learning works/);
    });

    it('threw no errors', () => {
      assert.deepEqual(errors, []);
    });
  },
);

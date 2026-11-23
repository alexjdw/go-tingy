/**
 * Journey test for joseki mode: the toggle, playing a puzzle from the first side and then the second, and the app
 * remembering which puzzles are joseki. Run with `npm run test:web`.
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
const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc](;W[rc]TE[1])(;W[pc]TE[1]))';
const PUZZLE = { id: 'c-joseki', title: 'Approach joseki', sgf: SGF };

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

describe('joseki mode in the browser', { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' }, () => {
  let outDir = '';
  let site: { url: string; close: () => void };
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];

  before(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-joseki-'));
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

  it('is off at first: the puzzle is played once', async () => {
    await click(page, 'Browse');
    await expectText(page, PUZZLE.title);
    assert.doesNotMatch(await bodyText(page), /Joseki/);
    await clickAria(page, `Play ${PUZZLE.title}`);
    await expectText(page, 'Joseki mode: off');
    assert.doesNotMatch(await bodyText(page), /side 1 of 2/);
  });

  it('plays the first side, then the other side starting from move 2', async () => {
    await click(page, 'Joseki mode: off');
    await expectText(page, 'Joseki mode: on');
    await expectText(page, 'joseki, side 1 of 2');
    // colors may be flipped at random (a setting), so read which color the player has on each side
    const first = /You play (Black|White)/.exec(await expectText(page, /You play (Black|White)/))![1];
    const second = first === 'Black' ? 'White' : 'Black';
    await tapBoard(page, pt('pd'));
    await tapBoard(page, pt('qc'));
    await expectText(page, 'First side solved');
    await click(page, 'Other side ›');
    await expectText(page, 'side 2 of 2');
    await expectText(page, `You play ${second}`, 4000);
    await tapBoard(page, pt('qf'));
    await tapBoard(page, pt('rc'));
    await expectText(page, 'Solved — no mistakes!');
  });

  it('remembers the puzzle is joseki, after leaving and after a reload', async () => {
    await click(page, '‹ Back');
    await expectText(page, 'Joseki');
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(800);
    await click(page, 'Browse');
    await expectText(page, 'Joseki');
    await clickAria(page, `Play ${PUZZLE.title}`);
    await expectText(page, 'Joseki mode: on');
    await expectText(page, 'side 1 of 2');
  });

  it('can be switched off again', async () => {
    await click(page, 'Joseki mode: on');
    await expectText(page, 'Joseki mode: off');
    await click(page, '‹ Back');
    await sleep(300);
    assert.doesNotMatch(await bodyText(page), /Joseki/);
  });

  it('can be set from the + menu of a tile, whatever the app is doing', async () => {
    await expectText(page, PUZZLE.title);
    await clickAria(page, `Add ${PUZZLE.title} to a study mode`);
    await click(page, 'Joseki mode: play both sides');
    await expectText(page, '✓ Joseki mode (tap to turn off)');
    await click(page, 'Add to guided learning');
    await click(page, 'Close');
    await expectText(page, 'Joseki');
  });

  it('applies in learning too: a guided run is played from both sides', async () => {
    await click(page, '‹ Back');
    await click(page, 'Guided Learning');
    await expectText(page, 'Joseki');
    await click(page, 'Play');
    await expectText(page, 'Guided learning');
    await click(page, 'Skip'); // the first-time tutorial
    await expectText(page, 'side 1 of 2');
    // the given moves are clicked through (the green dot), for both colors
    await expectText(page, 'Follow the green dot');
    await tapBoard(page, pt('pd'));
    await tapBoard(page, pt('qf'));
    const first = /You play (Black|White)/.exec(await expectText(page, /You play (Black|White)/, 6000))![1];
    const second = first === 'Black' ? 'White' : 'Black';
    await tapBoard(page, pt('qc'));
    await expectText(page, 'First side solved');
    await click(page, 'Other side ›');
    await expectText(page, 'side 2 of 2');
    // the other side also starts from move 1: click through the given moves, then play on
    await expectText(page, 'Follow the green dot');
    await tapBoard(page, pt('pd'));
    await tapBoard(page, pt('qf'));
    await tapBoard(page, pt('qc'));
    await expectText(page, `You play ${second}`, 6000);
    await tapBoard(page, pt('rc'));
    await expectText(page, /Clean run|cleared/);
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

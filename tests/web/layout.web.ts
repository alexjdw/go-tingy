/**
 * Browser layout test: builds the web app, drives it in headless Chrome through every screen (with a large,
 * realistic library), and fails if any button is covered, clipped or collapsed.
 *
 * This is the kind of bug unit tests can't see: on the web a horizontal ScrollView shrinks when a long list
 * below it claims the height, squashing its buttons to a sliver. Run with `npm run test:web`. It needs Chrome
 * (set CHROME_PATH if it isn't in a standard place) and takes about a minute because it builds the app.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { launch, type Browser } from 'puppeteer-core';
import { findChrome } from '../../scripts/lib/chrome';
import { buildWeb, clickText, serveDir, sleep } from '../../scripts/lib/web';

const chromePath = findChrome();

/** A big library, as after importing two collections, with some puzzles in each study category. */
const LIBRARY = Array.from({ length: 300 }, (_, i) => ({
  id: `c-${i + 1}`,
  title: `${i < 150 ? 'xxqj' : 'gzp1'} #${i + 1}`,
  collection: i < 150 ? 'xxqj' : 'gzp1',
  sgf: '(;GM[1]SZ[19]PL[B]AB[aa][ba]AW[ab];B[ac](;W[bb];B[ad]TE[1])(;W[bc];B[bd]TE[1]))',
}));
const MASTERY_STATE = {
  version: 1,
  spaced: { 'c-1': true, 'c-2': true, 'sample-capture-1': true },
  mastery: { 'c-1': true, 'sample-capture-1': true, 'c-3': true },
  scores: {
    'sample-capture-1': { guided: { free: 0, cleared: true } },
    'c-1': {
      guided: { free: 0, cleared: true },
      best: { score: 12, level: 'gold', moves: 12, mistakes: 0, ms: 60000, lines: 2, at: 1 },
    },
  },
  attempts: {},
};

// Scripts that run inside the page (kept as strings: this project's TypeScript has no DOM types).
const FIND_COVERED = `(() => {
  const out = [];
  // while a modal is open the page behind it is meant to be covered: check only the modal's own controls
  const root = document.querySelector('[aria-modal="true"]') || document;
  const cands = [...root.querySelectorAll('[role="button"], button, a, input, textarea, [tabindex="0"]')];
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    const label = (el.innerText || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 40);
    if (!r.width || !r.height) {
      // unlabeled zero-size elements are focus-trap helpers, not buttons
      if (label) out.push(label + ': collapsed to ' + r.width + 'x' + r.height);
      continue;
    }
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue; // scrolled away
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    if (top && !(el === top || el.contains(top) || top.contains(el)))
      out.push(label + ': covered by <' + top.tagName.toLowerCase() + '> ' + JSON.stringify((top.innerText || '').trim().slice(0, 30)));
  }
  return out;
})()`;

/** Text whose container has been squashed to (almost) nothing. */
const FIND_CLIPPED = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('div, span')) {
    if (el.children.length || !(el.innerText || '').trim()) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const pr = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      const clips = cs.overflow !== 'visible' || cs.overflowY !== 'visible';
      const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
      if (clips && !scrolls && (pr.height < 1 || r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1)) {
        out.push(JSON.stringify(el.innerText.trim().slice(0, 30)) + ' is clipped by a ' + Math.round(pr.height) + 'px-high container');
        break;
      }
    }
  }
  return out.slice(0, 8);
})()`;

// [label, text to click first]. Each screen is reached the way a person would.
const STEPS: [string, string | null][] = [
  ['home', null],
  ['browse', 'Browse'],
  ['browse: plus menu', '+'],
  ['browse: plus menu closed', 'Close'],
  ['browse: study (solve)', 'Play'],
  ['browse: back from study', '‹ Back'],
  ['browse: new puzzle (editor size)', 'New puzzle'],
  ['editor: black stones', 'Next ›'],
  ['editor: white stones', 'Next ›'],
  ['editor: move tree', 'Next ›'],
  ['back to browse from editor', '‹ Cancel'],
  ['browse: import', '+ SGF'],
  ['back to browse from import', 'Cancel'],
  ['browse: new from game', 'New from game'],
  ['back to browse from new from game', '‹ Cancel'],
  ['back to home', '‹ Back'],
  ['mastery', 'Guided Learning'],
  ['mastery: add puzzles', 'Add puzzles'],
  ['mastery: back from add puzzles', '‹ Back'],
  ['mastery: play (run)', 'Play'],
  ['mastery run: playing', 'Start'],
  ['mastery: back from run', '‹ Back'],
  ['back to home from mastery', '‹ Back'],
  ['settings', 'Settings'],
  ['back to home from settings', '‹ Back'],
  ['spaced repetition: session starts', 'Spaced repetition'],
  ['spaced repetition: end session', '‹ End'],
  ['spaced repetition: prune', 'Prune puzzles'],
  ['back to home from prune', '‹ Back'],
  ['spaced repetition again', 'Spaced repetition'],
  ['spaced repetition: end', '‹ End'],
  ['spaced repetition: add puzzles', 'Add puzzles'],
];

const VIEWPORTS: [string, number, number][] = [
  ['small phone', 320, 568],
  ['phone', 390, 844],
  ['desktop', 1280, 800],
  ['short desktop', 1000, 500],
  ['iPad', 768, 1024],
  ['iPad Pro 13', 1032, 1376],
  ['Android phone', 360, 640],
  ['phone landscape', 844, 390],
  ['folded foldable', 280, 653],
  ['unfolded foldable', 717, 512],
];

describe('web layout', { skip: chromePath ? false : 'Chrome not found (set CHROME_PATH)' }, () => {
  let outDir = '';
  let site: { url: string; close: () => void };
  let browser: Browser;

  before(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-web-'));
    buildWeb(outDir);
    site = await serveDir(outDir);
    browser = await launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  });

  after(async () => {
    await browser?.close();
    site?.close();
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
  });

  for (const [name, width, height] of VIEWPORTS) {
    it(`no covered, clipped or collapsed buttons on any screen (${name}, ${width}x${height})`, async () => {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.setViewport({ width, height });
      await page.evaluateOnNewDocument(
        (lib, mastery) => {
          localStorage.setItem('library.v1', JSON.stringify(lib));
          localStorage.setItem('mastery.v1', JSON.stringify(mastery));
        },
        LIBRARY,
        MASTERY_STATE,
      );
      await page.goto(site.url, { waitUntil: 'networkidle0' });
      await sleep(800);

      const problems: string[] = [];
      for (const [label, click] of STEPS) {
        if (click) {
          const ok = await clickText(page, click);
          if (!ok) {
            problems.push(`${label}: could not find "${click}" to click`);
            continue;
          }
        }
        const covered = (await page.evaluate(FIND_COVERED)) as string[];
        const clipped = (await page.evaluate(FIND_CLIPPED)) as string[];
        for (const c of [...covered, ...clipped]) problems.push(`${label}: ${c}`);
      }
      await page.close();

      assert.deepEqual(errors, [], 'the page threw errors');
      assert.deepEqual(problems, [], `layout problems at ${width}x${height}:\n  ${problems.join('\n  ')}`);
    });
  }
});

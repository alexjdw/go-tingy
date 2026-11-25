/**
 * Reaching diamond in guided learning asks whether to move the puzzle to spaced repetition. Run with
 * `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, expectNoText, click, tapBoard, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';
import { pt } from '../lib/helpers';

const SGF = '(;GM[1]SZ[9]PL[B]AB[aa]AW[bb](;B[cc]))';
const LIB = [
  { id: 'p-keep', title: 'Keeper', sgf: SGF },
  { id: 'p-move', title: 'Mover', sgf: SGF },
];
const LEARNING = {
  version: 1,
  spaced: {},
  learning: { 'p-keep': true, 'p-move': true },
  scores: {
    'p-keep': { guided: { free: 0, cleared: true } },
    'p-move': { guided: { free: 0, cleared: true } },
  },
  attempts: {},
};

describe('diamond in guided learning', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('diamond', {
      viewport: { width: 700, height: 1100 },
      library: LIB,
      prepare: async (p) => {
        await p.evaluateOnNewDocument((l) => {
          if (!localStorage.getItem('learning.v1')) localStorage.setItem('learning.v1', JSON.stringify(l));
        }, LEARNING);
      },
    });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
  });

  /** Play the puzzle with this title in its timed run, as fast as the test can. */
  async function solve(title: string) {
    await click(page, 'Guided Learning');
    await expectText(page, title);
    await page.evaluate(
      `(() => { const b = document.querySelector('[aria-label=${JSON.stringify(`Play ${title}`)}]'); b.click(); })()`,
    );
    await expectText(page, '1 line to solve');
    await click(page, 'Start');
    await tapBoard(page, SGF, pt('cc'));
    await expectText(page, 'All 1 line solved');
    await expectText(page, `${title} has reached diamond. Move it to spaced repetition?`);
  }

  it('No keeps the puzzle in guided learning', async () => {
    await solve('Keeper');
    await click(page, 'No, keep it in guided learning');
    await click(page, 'Done');
    await expectText(page, 'Keeper');
    await expectText(page, 'Mover');
  });

  it('Yes moves it: gone from guided learning, in spaced repetition and not due for weeks', async () => {
    await click(page, '‹ Back');
    await solve('Mover');
    await click(page, 'Yes, move it');
    await click(page, 'Done');
    await expectNoText(page, 'Mover');
    await expectText(page, 'Keeper');
    await click(page, '‹ Back');
    await expectText(page, 'Nothing due right now · 1 puzzle');
  });

  it('remembers it after a reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(800);
    await expectText(page, 'Nothing due right now · 1 puzzle');
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

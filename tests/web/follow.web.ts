/**
 * Journey test for guided learning runs: the first-time tutorial, then clicking through the given moves (both sides)
 * on the green dot, then finishing alone. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  type App,
  startApp,
  skipWithoutChrome,
  expectText,
  click,
  clickAria,
  tapBoard,
  bodyText,
  sleep,
} from '../lib/web';
import type { Page } from 'puppeteer-core';
import { pt } from '../lib/helpers';

const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc];W[rc];B[sd];W[se])';
const PUZZLE = { id: 'c-follow', title: 'Long line', sgf: SGF };

describe('following the given moves in a guided run', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('follow', { viewport: { width: 390, height: 1000 }, library: [PUZZLE] });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
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
    await tapBoard(page, SGF, pt('sd'));
    await expectText(page, 'Follow the green dot');
    for (const p of ['pd', 'qf', 'qc', 'rc']) {
      await expectText(page, 'Follow the green dot');
      await tapBoard(page, SGF, pt(p));
    }
    await expectText(page, /You play (Black|White)/);
    await tapBoard(page, SGF, pt('sd'));
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
});

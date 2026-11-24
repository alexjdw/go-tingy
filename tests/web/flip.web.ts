/**
 * The color flip is decided when a puzzle opens and stays put while the mode changes between Hints, Solve and
 * Explore. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';

// three black stones and one white one, so a flip shows as the counts swapping
const PUZZLE = { id: 'c-flip', title: 'Flip line', sgf: '(;GM[1]SZ[9]PL[B]AB[aa][bb][cc]AW[dd](;B[ee]TE[1]))' };

const stones = (page: Page) =>
  page.evaluate(
    `({ black: document.querySelectorAll('circle[fill="#111"]').length, white: document.querySelectorAll('circle[fill="#f6f6f2"]').length })`,
  ) as Promise<{ black: number; white: number }>;

describe('the color flip', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('flip', {
      viewport: { width: 700, height: 1100 },
      library: [PUZZLE],
      prepare: async (p) => {
        // the app draws a random number to decide the flip: 0.1 flips, anything above 0.5 does not
        await p.evaluateOnNewDocument(() => {
          (window as unknown as { __roll: number }).__roll = 0.1;
          Math.random = () => (window as unknown as { __roll: number }).__roll;
        });
      },
    });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
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

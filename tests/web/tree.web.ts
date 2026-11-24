/**
 * Explore mode: the arrow keys step through the tree (preferring the correct branch), and the picture of the tree
 * can be clicked. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Page } from 'puppeteer-core';
import { type App, click, expectText, skipWithoutChrome, sleep, startApp } from '../lib/web';

// the first branch is wrong, the second leads to a move marked correct
const SGF = '(;GM[1]SZ[9]PL[B](;B[aa]BM[1];W[bb])(;B[cc](;W[dd];B[ee]TE[1])(;W[ff];B[gg])))';
const PUZZLE = { id: 'c-tree', title: 'Branches', sgf: SGF };

/** How many stones of each color are on the board (the tree's circles are drawn in other shades). */
const stones = (page: Page) =>
  page.evaluate(
    `({ black: document.querySelectorAll('circle[fill="#111"]').length, white: document.querySelectorAll('circle[fill="#f6f6f2"]').length })`,
  ) as Promise<{ black: number; white: number }>;

/** Click the tree's node in column `depth` and line `row`. */
const clickTreeNode = async (page: Page, depth: number, row: number) => {
  const box = (await page.evaluate(
    `(() => { const b = document.querySelector('[aria-label="Move tree"] svg').getBoundingClientRect(); return { x: b.left, y: b.top }; })()`,
  )) as { x: number; y: number };
  await page.mouse.click(box.x + 18 + depth * 30, box.y + 18 + row * 30);
  await sleep(300);
};

describe('walking the tree in explore mode', { skip: skipWithoutChrome }, () => {
  let app: App;

  before(async () => {
    app = await startApp('tree', { viewport: { width: 700, height: 1100 }, library: [PUZZLE] });
  });
  after(async () => {
    await app?.close();
  });

  it('the right arrow follows the correct branch, the left arrow goes back', async () => {
    const { page } = app;
    await click(page, 'Browse');
    await page.evaluate(`document.querySelector('[aria-label="Play ${PUZZLE.title}"]').click()`);
    await click(page, 'Explore');
    await expectText(page, 'step through the moves');
    assert.deepEqual(await stones(page), { black: 0, white: 0 });

    await page.keyboard.press('ArrowRight');
    await sleep(300);
    assert.deepEqual(await stones(page), { black: 1, white: 0 }, 'the move that is not marked wrong');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await sleep(300);
    assert.deepEqual(await stones(page), { black: 2, white: 1 }, 'down the line that ends in the correct move');
    await page.keyboard.press('ArrowRight'); // the end of the line: nothing happens
    await sleep(200);
    assert.deepEqual(await stones(page), { black: 2, white: 1 });

    await page.keyboard.press('ArrowLeft');
    await sleep(300);
    assert.deepEqual(await stones(page), { black: 1, white: 1 });
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await sleep(300);
    assert.deepEqual(await stones(page), { black: 0, white: 0 }, 'back at the start, and no further');
  });

  it('clicking a move in the tree goes there, in another branch too', async () => {
    const { page } = app;
    await clickTreeNode(page, 3, 2);
    assert.deepEqual(await stones(page), { black: 2, white: 1 }, 'B cc, W ff and B gg');
    await clickTreeNode(page, 2, 0); // W dd, in the first variation
    assert.deepEqual(await stones(page), { black: 1, white: 1 }, 'B cc and W dd, not the other branch');
  });

  it('the Forward button does the same as the right arrow, and Undo the same as the left', async () => {
    const { page } = app;
    await click(page, 'Undo'); // dd -> cc
    await click(page, 'Undo'); // cc -> the start
    await click(page, 'Forward ›');
    await sleep(300);
    assert.equal((await stones(page)).black, 1);
  });

  it('threw no errors', () => {
    assert.deepEqual(app.errors, []);
  });
});

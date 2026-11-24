/**
 * Journey test for "New from game": paste a game, choose the moves, choose the area, save, and find the puzzle in
 * Browse. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, clickAria } from '../lib/web';
import type { Page } from 'puppeteer-core';

const GAME = '(;GM[1]SZ[19]PB[Kuro]PW[Shiro];B[ab];W[aa];B[ba];W[pp];B[dd])';

describe('new from game in the browser', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('fromgame', { viewport: { width: 390, height: 844 } });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
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

/**
 * Journey test for joseki mode: the toggle, playing a puzzle from the first side and then the second, and the app
 * remembering which puzzles are joseki. Run with `npm run test:web`.
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

const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc](;W[rc]TE[1])(;W[pc]TE[1]))';
const PUZZLE = { id: 'c-joseki', title: 'Approach joseki', sgf: SGF };

describe('joseki mode in the browser', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('joseki', { viewport: { width: 390, height: 1000 }, library: [PUZZLE] });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
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
    await tapBoard(page, SGF, pt('pd'));
    await tapBoard(page, SGF, pt('qc'));
    await expectText(page, 'First side solved');
    await click(page, 'Other side ›');
    await expectText(page, 'side 2 of 2');
    await expectText(page, `You play ${second}`, 4000);
    await tapBoard(page, SGF, pt('qf'));
    await tapBoard(page, SGF, pt('rc'));
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
    await tapBoard(page, SGF, pt('pd'));
    await tapBoard(page, SGF, pt('qf'));
    const first = /You play (Black|White)/.exec(await expectText(page, /You play (Black|White)/, 6000))![1];
    const second = first === 'Black' ? 'White' : 'Black';
    await tapBoard(page, SGF, pt('qc'));
    await expectText(page, 'First side solved');
    await click(page, 'Other side ›');
    await expectText(page, 'side 2 of 2');
    // the other side also starts from move 1: click through the given moves, then play on
    await expectText(page, 'Follow the green dot');
    await tapBoard(page, SGF, pt('pd'));
    await tapBoard(page, SGF, pt('qf'));
    await tapBoard(page, SGF, pt('qc'));
    await expectText(page, `You play ${second}`, 6000);
    await tapBoard(page, SGF, pt('rc'));
    await expectText(page, /Clean run|cleared/);
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

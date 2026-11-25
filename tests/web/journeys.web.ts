/**
 * Journey test: drives the real app in headless Chrome through the study modes and checks what happens. The
 * layout test proves buttons are reachable; this proves the flows work. Run with `npm run test:web`.
 *
 * It uses the app's built-in puzzles (all one-move captures) on a fresh profile, in one long story, so each step
 * relies on the one before it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { SAMPLES } from '../../src/data/samples';
import { type Point } from '../../src/sgf/parser';
import {
  type App,
  startApp,
  skipWithoutChrome,
  expectText,
  expectNoText,
  click,
  clickAria,
  tapBoard,
  bodyText,
  sleep,
} from '../lib/web';
import type { Page } from 'puppeteer-core';

const [CORNER, EDGE, OPEN] = SAMPLES; // Corner capture, Edge pair in atari, Capture in the open
const ANSWER: Record<string, Point> = {
  [CORNER.id]: { x: 0, y: 2 },
  [EDGE.id]: { x: 0, y: 3 },
  [OPEN.id]: { x: 3, y: 4 },
};
const WRONG: Point = { x: 3, y: 3 }; // empty and inside every built-in puzzle's window, and never the answer

const count = (page: Page, js: string) => page.evaluate(js) as Promise<number>;

/** The widths of the progress bars on screen, as a string, to see whether they changed. */
const BARS = `[...document.querySelectorAll('[aria-label="Skill"] > div')].map((e) => e.getAttribute('style')).join('|')`;

describe('journeys', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('journey', { viewport: { width: 390, height: 844 } });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
  });

  it('Home offers the three modes', async () => {
    const t = await expectText(page, 'How do you want to study?');
    for (const mode of ['Guided Learning', 'Spaced repetition', 'Browse']) assert.ok(t.includes(mode), mode);
    assert.equal(
      (t.match(/No puzzles yet/g) ?? []).length,
      2,
      'a fresh install has nothing in learning or spaced repetition',
    );
    assert.ok(!t.includes('New puzzle'), 'New puzzle is under Browse, not on Home');
  });

  it('Browse shows puzzles as tiles with Play and + under each; New and Import live here', async () => {
    await click(page, 'Browse');
    const t = await expectText(page, 'New puzzle');
    for (const s of SAMPLES) assert.ok(t.includes(s.title), s.title);
    assert.ok(t.includes('+ SGF'));
    assert.equal(
      await count(
        page,
        `[...document.querySelectorAll('div, span')].filter((e) => !e.children.length && e.innerText === 'Play').length`,
      ),
      4,
    );
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label$=" to a study mode"]').length`),
      4,
      'a + for each',
    );
    assert.ok((await count(page, `document.querySelectorAll('svg').length`)) >= 4, 'each tile draws its position');
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label="Skill"]').length`),
      0,
      'no bar outside learning',
    );
  });

  it('+ pops up the choice to add to learning and spaced repetition', async () => {
    await clickAria(page, `Add ${CORNER.title} to a study mode`);
    await expectText(page, 'Add to spaced repetition');
    await expectText(page, 'Add to guided learning');
    await click(page, 'Add to spaced repetition');
    await expectText(page, '✓ Spaced repetition (tap to remove)');
    await click(page, 'Add to guided learning');
    await expectText(page, '✓ Guided learning (tap to remove)');
    await click(page, 'Close');
    await expectText(page, 'Spaced repetition');
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label="Level: just starting"]').length`),
      1,
      'a red badge on the learning puzzle, not the word Learning',
    );
    assert.ok(!(await bodyText(page)).includes('Spaced repetition · Learning'));
  });

  it('Home shows what is due and what is ready', async () => {
    await click(page, '‹ Back');
    await expectText(page, '1 due now');
    await expectText(page, '1 puzzle · 1 ready today');
  });

  it('choosing spaced repetition starts a session immediately', async () => {
    await click(page, 'Spaced repetition');
    await expectText(page, 'Review 1 of 1');
    await expectText(page, CORNER.title);
    await expectNoText(page, 'Browse');
  });

  it('a puzzle missed in the session comes back once, then the session ends with a summary', async () => {
    await tapBoard(page, CORNER.sgf, WRONG);
    await expectNoText(page, 'Solved');
    await tapBoard(page, CORNER.sgf, ANSWER[CORNER.id]);
    await expectText(page, 'Solved with 1 mistake');
    await click(page, 'Next ›');
    await expectText(page, 'Review 2 of 2');
    await tapBoard(page, CORNER.sgf, ANSWER[CORNER.id]);
    await expectText(page, 'Solved — no mistakes!');
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label="Skill"], [aria-label="Learning progress"]').length`),
      0,
      'spaced repetition shows no skill bar',
    );
    await click(page, 'Finish');
    await expectText(page, 'Session complete');
    await expectText(page, '1 reviewed · 0 right first time');
    await expectText(page, '1 to practise again, 1 fixed on the second try.');
  });

  it('the end of the session offers Add puzzles and Prune puzzles', async () => {
    const t = await bodyText(page);
    for (const b of ['Add puzzles', 'Prune puzzles', 'Done']) assert.ok(t.includes(b), b);
    assert.doesNotMatch(t, /Review \d+ more/, 'nothing else is due yet');
  });

  it('Add puzzles opens Browse, which also creates and imports; adding works; Back returns home', async () => {
    await click(page, 'Add puzzles');
    await expectText(page, 'to Spaced repetition · 1 added so far');
    const bar = await bodyText(page);
    for (const b of ['New puzzle', 'New from game', '+ SGF']) assert.ok(bar.includes(b), `${b} is offered when adding`);
    assert.doesNotMatch(bar, /Play/, 'tiles add instead of play');
    await clickAria(page, `Add ${OPEN.title} to Spaced repetition`);
    await expectText(page, '✓ Added');
    await expectText(page, '2 added so far');
    await click(page, '‹ Back');
    await expectText(page, 'How do you want to study?');
    await expectText(page, '1 due now');
  });

  it('ending a session early keeps what is still due; Prune lists the easiest first and removes', async () => {
    await click(page, 'Spaced repetition');
    await expectText(page, 'Review 1 of 1');
    await expectText(page, OPEN.title);
    await click(page, '‹ End');
    await expectText(page, 'Session ended');
    await expectText(page, '1 still due.');
    await click(page, 'Prune puzzles');
    const t = await expectText(page, 'Prune puzzles');
    assert.ok(t.indexOf(CORNER.title) < t.indexOf(OPEN.title), 'the puzzle you know goes first; the new one last');
    await clickAria(page, `Remove ${CORNER.title} from spaced repetition`);
    await expectNoText(page, CORNER.title);
    await expectText(page, OPEN.title);
    await click(page, '‹ Back');
    await expectText(page, '1 due now');
  });

  it('Learning lists its puzzles as tiles with Add puzzles near the top', async () => {
    await click(page, 'Guided Learning');
    await expectText(page, '1 puzzle · 1 ready today');
    await expectText(page, 'Guided: stage 1 of 1 · 0 free moves');
    const t = await bodyText(page);
    assert.ok(t.indexOf('Add puzzles') < t.indexOf(CORNER.title), 'the button comes before the tiles');
    await click(page, 'Add puzzles');
    await expectText(page, 'to Guided learning · 1 added so far');
    await clickAria(page, `Add ${EDGE.title} to Guided learning`);
    await expectText(page, '2 added so far');
    await click(page, '‹ Back');
    await expectText(page, '2 puzzles · 2 ready today');
    await expectText(page, EDGE.title);
  });

  it('Play does the next step: a guided run, then a timed run, two attempts a day', async () => {
    const barBefore = (await page.evaluate(BARS)) as string;
    assert.ok(barBefore, 'a learning tile has a progress bar');
    await click(page, 'Play'); // Corner capture's tile is first
    await expectText(page, 'Guided learning · 0 free moves');
    // the first time, a short tutorial explains the mode
    await expectText(page, 'Follow the green dot');
    await click(page, 'Next');
    await expectText(page, 'Then finish it yourself');
    await click(page, 'Next');
    await expectText(page, 'Fewer given moves each time');
    await click(page, 'Got it');
    assert.ok(!(await bodyText(page)).includes('Then finish it yourself'), 'the tutorial closed');
    await tapBoard(page, CORNER.sgf, ANSWER[CORNER.id]);
    await expectText(page, 'Guided stage cleared! Timed runs are unlocked.');
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label="Solved"]').length`),
      1,
      'a checkmark stamp on the board says it is solved',
    );
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label="Learning progress"]').length`),
      1,
      'the run shows how far along the puzzle is',
    );
    await click(page, '‹ Back');
    assert.notEqual(await page.evaluate(BARS), barBefore, 'the bar filled as the guided stage was cleared');
    await expectText(page, 'Guided cleared · ready for timed runs');
    await click(page, 'Play');
    await expectText(page, '1 line to solve');
    await click(page, 'Start');
    await tapBoard(page, CORNER.sgf, ANSWER[CORNER.id]);
    await expectText(page, 'All 1 line solved');
    await expectText(page, 'Move it to spaced repetition?'); // solved this fast, it is diamond
    await click(page, 'No, keep it in guided learning');
    await click(page, 'Done');
    await expectText(page, /Best: \w+ · \d/);
    await expectText(page, 'Tomorrow');
    await expectText(page, 'no attempts left today');
  });

  it('playing a puzzle normally shows no bar and changes no progress', async () => {
    await click(page, '‹ Back');
    await click(page, 'Browse');
    await expectText(page, 'New puzzle');
    const before = (await page.evaluate(BARS)) as string;
    assert.ok(before, 'the puzzle in learning has a progress bar');
    await click(page, 'Play'); // Corner capture's tile is first
    await tapBoard(page, CORNER.sgf, WRONG);
    await tapBoard(page, CORNER.sgf, ANSWER[CORNER.id]);
    await expectText(page, 'Solved');
    assert.equal(
      await count(page, `document.querySelectorAll('[aria-label="Skill"]').length`),
      0,
      'no bar while playing',
    );
    await click(page, '‹ Back');
    await expectText(page, 'New puzzle');
    assert.equal(await page.evaluate(BARS), before, 'the failed attempt changed nothing');
    await click(page, '‹ Back');
  });

  it('keeps everything after a reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(800);
    await expectText(page, 'How do you want to study?');
    await expectText(page, '2 puzzles · 1 ready today');
    await expectText(page, '1 due now');
  });

  it('threw no errors along the way', () => {
    assert.deepEqual(errors, []);
  });
});

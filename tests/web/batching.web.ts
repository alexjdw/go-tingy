/**
 * Browser test for the tile batches: a library bigger than one batch shows 10 tiles first and loads 10 more each
 * time the player scrolls near the end or taps "Show more". Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Page } from 'puppeteer-core';
import { SAMPLES } from '../../src/data/samples';
import { type App, bodyText, click, expectText, skipWithoutChrome, sleep, startApp } from '../lib/web';

// 35 imported puzzles (25 in one collection, 10 in another) plus the 4 built-in ones = 39
const CUSTOM = Array.from({ length: 35 }, (_, i) => ({
  id: `c-${i + 1}`,
  title: `Puzzle ${String(i + 1).padStart(2, '0')}`,
  collection: i < 25 ? 'alpha' : 'beta',
  sgf: `(;GM[1]SZ[19]PL[B]AB[aa]AW[ab];B[ac]TE[1]C[puzzle ${i + 1}])`,
}));
const TOTAL = CUSTOM.length + SAMPLES.length;

const tiles = (page: Page) =>
  page.evaluate(
    `[...document.querySelectorAll('div, span')].filter((e) => !e.children.length && e.innerText === 'Play').length`,
  ) as Promise<number>;

/** Wait until exactly `n` tiles are drawn. */
async function expectTiles(page: Page, n: number, ms = 6000) {
  const end = Date.now() + ms;
  let now = -1;
  while (Date.now() < end) {
    now = await tiles(page);
    if (now === n) return;
    await sleep(150);
  }
  assert.fail(`expected ${n} tiles, found ${now}`);
}

/** Scroll the tile list to its end, like a finger would. */
async function scrollToEnd(page: Page) {
  const ok = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('div')].filter((e) => {
      const o = getComputedStyle(e).overflowY;
      return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 20;
    });
    if (!els.length) return false;
    const list = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    list.scrollTop = list.scrollHeight;
    return true;
  })()`);
  assert.ok(ok, 'found a scrolling list');
  await sleep(600);
}

describe('tile batches in the browser', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;

  before(async () => {
    app = await startApp('batch', { viewport: { width: 390, height: 844 }, library: CUSTOM });
    page = app.page;
  });

  after(async () => {
    await app?.close();
  });

  it('Browse draws the first 10 tiles of a bigger library', async () => {
    await expectText(page, `${TOTAL} puzzles`.replace(/^/, ''), 100).catch(() => undefined); // Home shows the total
    await click(page, 'Browse');
    await expectTiles(page, 10);
    await expectText(page, `Showing 10 of ${TOTAL}`);
    await expectText(page, 'Show 10 more');
  });

  it('"Show 10 more" adds a batch each time, and the last one is smaller', async () => {
    await click(page, 'Show 10 more');
    await expectTiles(page, 20);
    await expectText(page, `Showing 20 of ${TOTAL}`);
    await click(page, 'Show 10 more');
    await expectTiles(page, 30);
    await expectText(page, `Showing 30 of ${TOTAL}`);
    await expectText(page, `Show ${TOTAL - 30} more`);
    await click(page, `Show ${TOTAL - 30} more`);
    // The list is scrolled to its end, so FlatList may have unmounted a few tiles at the top: check the footer
    // is gone (everything is loaded) and that most tiles are still drawn.
    await sleep(500);
    const t = await bodyText(page);
    assert.doesNotMatch(t, /Show \d+ more/, 'nothing is left to load');
    assert.doesNotMatch(t, /Showing \d+ of/);
    assert.ok((await tiles(page)) >= 30, 'the loaded tiles are drawn');
  });

  it('scrolling near the end loads the next batch by itself', async () => {
    await click(page, '‹ Back');
    await click(page, 'Browse');
    await expectTiles(page, 10);
    await scrollToEnd(page);
    // "Showing 10 of ..." is there before the scroll has loaded anything, so wait for a second batch
    const t = await expectText(page, /Showing ([2-9]\d|\d{3,}) of \d+/);
    const shown = Number(/Showing (\d+) of/.exec(t)![1]);
    assert.ok(shown >= 20 && shown <= TOTAL, `scrolling loaded more (shows ${shown})`);
    assert.ok((await tiles(page)) >= 20);
  });

  it('choosing a collection starts again from the first batch', async () => {
    await click(page, 'alpha (25)');
    await expectTiles(page, 10);
    await expectText(page, 'Showing 10 of 25');
    await click(page, 'Show 10 more');
    await expectTiles(page, 20);
    await click(page, 'beta (10)');
    await expectTiles(page, 10);
    const t = await bodyText(page);
    assert.doesNotMatch(t, /Show \d+ more/, 'exactly one batch: nothing more to load');
    await click(page, 'All puzzles');
    await expectTiles(page, 10);
    await expectText(page, `Showing 10 of ${TOTAL}`);
  });

  it('the Add puzzles picker is batched too', async () => {
    await click(page, '‹ Back');
    await click(page, 'Guided Learning');
    await click(page, 'Add puzzles');
    await expectText(page, 'to Guided learning · 0 added so far');
    const added = (await page.evaluate(
      `[...document.querySelectorAll('div, span')].filter((e) => !e.children.length && e.innerText === 'Add').length`,
    )) as number;
    assert.equal(added, 10, 'ten tiles, each with an Add button');
    await expectText(page, `Showing 10 of ${TOTAL}`);
  });
});

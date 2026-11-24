/**
 * Browser test for the tile stats: hovering a tile (or long-pressing it) shows the puzzle's stats in every mode.
 * Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { SAMPLES } from '../../src/data/samples';
import { type App, startApp, skipWithoutChrome, expectText, click, bodyText, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';
import { clickText } from '../../scripts/lib/web';

const FIRST = SAMPLES[0];

/** The middle of the first tile's title. */
const titleBox = (page: Page) =>
  page.evaluate(
    `(() => { const e = [...document.querySelectorAll('div, span')].find((x) => !x.children.length && x.innerText === ${JSON.stringify(FIRST.title)});
      const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`,
  ) as Promise<{ x: number; y: number }>;

describe('tile stats in the browser', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('stats', { viewport: { width: 1000, height: 900 } });
    ({ page, errors } = app);
    await click(page, 'Browse');
  });

  after(async () => {
    await app?.close();
  });

  it('shows the stats for every mode while the pointer is over a tile', async () => {
    const { x, y } = await titleBox(page);
    await page.mouse.move(x, y);
    const t = await expectText(page, 'Joseki mode');
    for (const s of ['Spaced repetition', 'Guided learning', 'Not added', 'Both sides: Off'])
      assert.ok(t.includes(s), s);
    await page.mouse.move(2, 2);
    await sleep(300);
    assert.equal(await page.evaluate(`document.querySelectorAll('[aria-label="Puzzle stats"]').length`), 0);
  });

  it('shows them in a sheet after a long press', async () => {
    const { x, y } = await titleBox(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await sleep(700);
    await page.mouse.up();
    await expectText(page, FIRST.title);
    await expectText(page, 'Reviews');
    assert.ok(await clickText(page, 'Close', 400));
    await page.mouse.move(2, 2);
    await sleep(300);
    assert.doesNotMatch(await bodyText(page), /Both sides/);
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

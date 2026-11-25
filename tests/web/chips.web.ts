/**
 * Collection chips wrap onto lines instead of scrolling sideways; past three lines "View more" opens the rest.
 * Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, bodyText, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';

const SGF = '(;GM[1]SZ[9]PL[B]AB[aa]AW[bb](;B[cc]))';
const MANY = Array.from({ length: 40 }, (_, i) => ({
  id: `c-${i}`,
  title: `Puzzle ${i}`,
  sgf: SGF,
  collection: `Set ${String(i).padStart(2, '0')}`,
}));
const FEW = MANY.slice(0, 2);

const top = (page: Page, label: string) =>
  page.evaluate(
    `(() => { const e = document.querySelector('[aria-label=${JSON.stringify(label)}]'); return e ? e.getBoundingClientRect().top : null; })()`,
  ) as Promise<number | null>;

describe('collection chips', { skip: skipWithoutChrome }, () => {
  let app: App;
  let errors: string[];
  let page: Page;

  before(async () => {
    app = await startApp('chips', { viewport: { width: 700, height: 1000 }, library: MANY });
    ({ page, errors } = app);
    await click(page, 'Browse');
    await expectText(page, 'Set 00 (1)');
  });

  after(async () => {
    await app?.close();
  });

  it('wraps instead of scrolling sideways, and folds to three lines with a View more button', async () => {
    const wide = (await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')) as number;
    assert.ok(wide <= 0, 'no sideways scroll');
    const more = await top(page, 'View more');
    const first = await top(page, 'Set 00 (1)');
    const last = await top(page, 'Set 39 (1)');
    assert.ok(more !== null && first !== null && last !== null, 'the chips and View more are there');
    assert.ok(last > more, 'the last collection is folded away below the button');
    assert.ok(more - first < 4 * 52 + 8, 'at most three lines show above the button');
  });

  it('View more shows every collection and View less folds them again', async () => {
    await click(page, 'View more');
    await expectText(page, 'View less');
    const more = await top(page, 'View fewer');
    const last = await top(page, 'Set 39 (1)');
    assert.ok(last !== null && more !== null && last < more, 'the last collection now shows above the button');
    await click(page, 'View less');
    await expectText(page, 'View more');
    assert.ok(((await top(page, 'Set 39 (1)')) ?? 0) > ((await top(page, 'View more')) ?? 0));
  });

  it('shows no button when everything fits', async () => {
    await page.evaluate(() => localStorage.clear());
    const app2 = await startApp('chips-few', { viewport: { width: 700, height: 1000 }, library: FEW });
    try {
      await click(app2.page, 'Browse');
      await expectText(app2.page, 'Set 01 (1)');
      await sleep(300);
      assert.doesNotMatch(await bodyText(app2.page), /View more/);
      assert.deepEqual(app2.errors, []);
    } finally {
      await app2.close();
    }
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

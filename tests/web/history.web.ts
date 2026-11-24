/**
 * Journey test for the browser history: the Back and Forward buttons move along the app's screens.
 * Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, clickAria, bodyText, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';

const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc];W[rc];B[sd];W[se])';
const PUZZLE = { id: 'c-history', title: 'History line', sgf: SGF };

describe('the browser Back and Forward buttons', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('history', { viewport: { width: 390, height: 1000 }, library: [PUZZLE] });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
  });

  const nav = async (js: string) => {
    await page.evaluate(js);
    await sleep(700);
  };

  it('Back returns through the screens, Forward comes back', async () => {
    await expectText(page, 'How do you want to study?');
    await click(page, 'Browse');
    await expectText(page, PUZZLE.title);
    await clickAria(page, `Play ${PUZZLE.title}`);
    await expectText(page, 'Joseki mode');
    await nav('history.back()');
    await expectText(page, 'New from game');
    await nav('history.back()');
    await expectText(page, 'How do you want to study?');
    await nav('history.forward()');
    await expectText(page, PUZZLE.title);
    await nav('history.forward()');
    await expectText(page, 'Joseki mode');
  });

  it('the in-app Back button and the browser agree', async () => {
    await click(page, '‹ Back');
    await expectText(page, PUZZLE.title);
    await nav('history.forward()');
    await expectText(page, 'Joseki mode');
    await nav('history.back()');
    await nav('history.back()');
    await expectText(page, 'How do you want to study?');
  });

  it('opening a new screen drops the forward entries', async () => {
    await click(page, 'Browse');
    await nav('history.back()');
    await click(page, 'Settings');
    await nav('history.forward()');
    assert.doesNotMatch(await bodyText(page), /New from game/);
    await nav('history.back()');
    await expectText(page, 'How do you want to study?');
  });

  it('does not leave the app from the first screen', async () => {
    await expectText(page, 'How do you want to study?');
    assert.equal(await page.evaluate('location.pathname'), '/');
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

/**
 * The Editor's KataGo panel, with a stand-in for the engine the desktop app provides (`window.katago`).
 * Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Page } from 'puppeteer-core';
import { type App, bodyText, click, clickAria, expectText, skipWithoutChrome, sleep, startApp } from '../lib/web';

const PUZZLE = { id: 'c-engine', title: 'Corner', sgf: '(;GM[1]SZ[9]PL[B]AB[ba][ab]AW[bb][aa];B[cc];W[dd])' };

const FAKE_ENGINE = `
window.sent = [];
window.katago = {
  status: async () => ({ ready: true, message: '' }),
  query: async (text) => {
    window.sent.push(text);
    return JSON.stringify({
      moveInfos: [
        { move: 'D4', visits: 50, winrate: 0.55, scoreLead: 3.5, prior: 0.4, order: 0, pv: ['D4', 'E5', 'F6'] },
        { move: 'C3', visits: 20, winrate: 0.4, scoreLead: -1.25, prior: 0.2, order: 1, pv: ['C3'] },
      ],
    });
  },
};
`;

const openEditor = async (page: Page) => {
  await click(page, 'Browse');
  await clickAria(page, `Add ${PUZZLE.title} to a study mode`);
  await click(page, 'Edit puzzle');
};

describe('the KataGo panel in the Editor', { skip: skipWithoutChrome }, () => {
  let app: App;

  before(async () => {
    app = await startApp('engine', {
      library: [PUZZLE],
      // a string, not a function: the test runner would add helpers to a function that the page does not have
      prepare: async (page) => {
        await page.evaluateOnNewDocument(FAKE_ENGINE);
      },
    });
  });

  after(async () => {
    await app?.close();
  });

  it('asks for the position on the board and shows the suggestions', async () => {
    const { page } = app;
    await openEditor(page);
    await expectText(page, 'Ask KataGo');
    await click(page, 'Ask KataGo');
    await expectText(page, /55% for Black/);
    const text = await bodyText(page);
    assert.match(text, /D4/);
    assert.match(text, /\+3\.5/);
    assert.match(text, /−1\.2|−1\.3/);
    const sent = (await page.evaluate('window.sent')) as string[];
    assert.equal(sent.length, 1);
    const q = JSON.parse(sent[0]);
    assert.equal(q.boardXSize, 9);
    assert.deepEqual(q.moves, []);
    assert.equal(q.initialPlayer, 'B');
  });

  it('drops the suggestions when the position changes, and asks for the new one', async () => {
    const { page } = app;
    await click(page, '● C7'); // the first move of the puzzle's tree; White is to move now
    await sleep(300);
    assert.doesNotMatch(await bodyText(page), /55% for/);
    await click(page, 'Ask KataGo');
    await expectText(page, /55% for White/);
    const q = JSON.parse(((await page.evaluate('window.sent')) as string[])[1]);
    assert.equal(q.moves.length, 1);
    assert.deepEqual(q.moves[0], ['B', 'C7']);
  });

  it('threw no errors', () => {
    assert.deepEqual(app.errors, []);
  });
});

describe('the Editor without the desktop app', { skip: skipWithoutChrome }, () => {
  let app: App;
  before(async () => {
    app = await startApp('engine-none', { library: [PUZZLE] });
  });
  after(async () => {
    await app?.close();
  });

  it('says the engine is for the desktop app', async () => {
    await openEditor(app.page);
    await expectText(app.page, 'available in the desktop app');
    assert.deepEqual(app.errors, []);
  });
});

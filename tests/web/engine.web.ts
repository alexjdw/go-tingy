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

const NOT_SET_UP = `
window.ready = false;
window.opened = 0;
window.katago = {
  status: async () => ({
    ready: window.ready,
    message: window.ready ? '' : 'KataGo is not set up yet (missing: program, network, config). It goes in C:/Users/me/katago.',
    setup: { platform: 'win32', arch: 'x64', folder: 'C:/Users/me/katago' },
  }),
  openFolder: async () => { window.opened++; },
  query: async () => JSON.stringify({ moveInfos: [] }),
};
`;

describe('the Editor when KataGo is not set up', { skip: skipWithoutChrome }, () => {
  let app: App;

  before(async () => {
    app = await startApp('engine-setup', {
      viewport: { width: 700, height: 1300 },
      library: [PUZZLE],
      prepare: async (page) => {
        await page.evaluateOnNewDocument(NOT_SET_UP);
      },
    });
  });
  after(async () => {
    await app?.close();
  });

  it('shows the steps for this system and where the files go, and the helpers are off', async () => {
    const { page } = app;
    await openEditor(page);
    await expectText(page, 'Set up KataGo to use this');
    const text = await bodyText(page);
    assert.match(text, /Steps for Windows/);
    assert.match(text, /katago\.exe sits directly in it/);
    assert.match(text, /C:\/Users\/me\/katago/);
    assert.match(text, /Download KataGo \(OpenCL/);
    assert.match(text, /kata1-b18c384nbt|Download the network/);
    assert.match(text, /KataGo is not set up yet, so you build the tree by hand/);
    assert.doesNotMatch(text, /Ask KataGo/);
    // the toggle cannot be switched on, and saving is not held up by a check
    await click(page, 'Open the folder');
    assert.equal(await page.evaluate('window.opened'), 1);
  });

  it('Check again finds KataGo once it has been set up', async () => {
    const { page } = app;
    await click(page, 'Check again');
    await sleep(300);
    await expectText(page, 'Set up KataGo to use this'); // still not there
    await page.evaluate('window.ready = true');
    await click(page, 'Check again');
    await expectText(page, 'Ask KataGo');
    assert.doesNotMatch(await bodyText(page), /Set up KataGo to use this/);
    assert.deepEqual(app.errors, []);
  });
});

/**
 * The desktop workflow for cutting a puzzle into easier ones: split off a position from Explore, edit the new puzzle with
 * KataGo answering new moves, and have KataGo check it before it is saved. The engine is a stand-in
 * (`window.katago`). Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Page } from 'puppeteer-core';
import {
  type App,
  bodyText,
  click,
  clickAria,
  expectNoText,
  expectText,
  skipWithoutChrome,
  sleep,
  startApp,
} from '../lib/web';

// the first line is wrong; the second leads to a move marked correct, and has a variation
const SGF = '(;GM[1]SZ[9]PL[B](;B[aa]BM[1];W[bb])(;B[cc](;W[dd];B[ee]TE[1])(;W[ff];B[gg])))';
const PUZZLE = { id: 'c-split', title: 'Branches', sgf: SGF };

// A stand-in engine. Every move it is asked about is worth 55% for E5 (the favorite) and 50% for the rest, so a
// puzzle whose first move is E5 agrees with it; `window.badMoves` lists moves it rates 10%, and then it likes the rest.
const FAKE_ENGINE = `
window.sent = [];
window.badMoves = [];
window.katago = {
  status: async () => ({ ready: true, message: '' }),
  query: async (text) => {
    const q = JSON.parse(text);
    window.sent.push(q);
    const names = (q.allowMoves && q.allowMoves[0].moves) || ['E5'];
    const rate = (m) => (window.badMoves.includes(m) ? 0.1 : window.badMoves.length ? 0.9 : m === 'E5' ? 0.55 : 0.5);
    const infos = names.map((m) => ({ move: m, winrate: rate(m) })).sort((a, b) => b.winrate - a.winrate);
    return JSON.stringify({
      moveInfos: infos.map((x, i) => ({ move: x.move, visits: 10, winrate: x.winrate, scoreLead: 0, prior: 0.1, order: i, pv: [x.move] })),
    });
  },
};
`;

const stones = (page: Page) =>
  page.evaluate(
    `({ black: document.querySelectorAll('circle[fill="#111"]').length, white: document.querySelectorAll('circle[fill="#f6f6f2"]').length })`,
  ) as Promise<{ black: number; white: number }>;

/** Tap a point of a full 9x9 board (the editor shows the whole board). */
const tapEditor = async (page: Page, x: number, y: number) => {
  const box = (await page.evaluate(
    `(() => { const r = [...document.querySelectorAll('svg rect')].filter((e) => e.getAttribute('fill') === 'transparent')[${y * 9 + x}];
      const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`,
  )) as { x: number; y: number };
  await page.mouse.click(box.x, box.y);
  await sleep(500);
};

/** Click the node in column `depth` and line `row` of the tree picture. */
const clickTreeNode = async (page: Page, depth: number, row: number) => {
  const box = (await page.evaluate(
    `(() => { const b = document.querySelector('[aria-label="Move tree"] svg').getBoundingClientRect(); return { x: b.left, y: b.top }; })()`,
  )) as { x: number; y: number };
  await page.mouse.click(box.x + 18 + depth * 30, box.y + 18 + row * 30);
  await sleep(300);
};

const sent = (page: Page) => page.evaluate('window.sent.length') as Promise<number>;
const openEditor = async (page: Page, fromHome = true) => {
  if (fromHome) await click(page, 'Browse');
  await clickAria(page, `Add ${PUZZLE.title} to a study mode`);
  await click(page, 'Edit puzzle');
};

describe('splitting a puzzle off in the desktop app', { skip: skipWithoutChrome }, () => {
  let app: App;

  before(async () => {
    app = await startApp('split', {
      viewport: { width: 700, height: 1300 },
      library: [PUZZLE],
      prepare: async (page) => {
        await page.evaluateOnNewDocument(FAKE_ENGINE);
      },
    });
  });
  after(async () => {
    await app?.close();
  });

  it('Split off here opens the position at the chosen move as a new puzzle in the editor', async () => {
    const { page } = app;
    await click(page, 'Browse');
    await page.evaluate(`document.querySelector('[aria-label="Play ${PUZZLE.title}"]').click()`);
    await click(page, 'Explore');
    await expectText(page, 'Split off here');
    await clickTreeNode(page, 2, 1); // White dd, in the second line
    await click(page, 'Split off here');
    await expectText(page, 'Edit puzzle');
    assert.equal(await page.evaluate(`document.querySelector('input[placeholder="Title"]').value`), 'Branches (split)');
    assert.deepEqual(await stones(page), { black: 1, white: 1 }, 'the position after B cc and W dd');
  });

  it('KataGo answers a new move with its best reply, and the board follows', async () => {
    const { page } = app;
    await expectText(page, 'KataGo helps: on');
    const before = await sent(page);
    await tapEditor(page, 6, 6); // Black plays G3
    await expectText(page, /KataGo answered E5/);
    assert.equal((await sent(page)) - before, 1, 'one question for one move');
    const text = await bodyText(page);
    assert.match(text, /●G3/);
    assert.match(text, /○E5/);
    assert.match(text, /chance after that/);
  });

  it('with KataGo off, a new move is just a move', async () => {
    const { page } = app;
    await clickAria(page, 'KataGo helps: on');
    await expectText(page, 'KataGo helps: off');
    await click(page, '↑ Parent');
    await click(page, '↑ Parent');
    const before = await sent(page);
    await tapEditor(page, 6, 2); // Black plays G7
    assert.match(await bodyText(page), /●G7/);
    assert.equal(await sent(page), before, 'KataGo was not asked');
  });

  it('saving with KataGo off does not check the puzzle, and the split puzzle joins the library', async () => {
    const { page } = app;
    const before = await sent(page);
    await click(page, 'Save puzzle');
    await expectText(page, 'Split off here'); // saving returns to the puzzle it was split from
    assert.equal(await sent(page), before);
    await click(page, '‹ Back');
    await expectText(page, 'Branches (split)');
  });

  it('threw no errors', () => {
    assert.deepEqual(app.errors, []);
  });
});

describe('KataGo checking a puzzle before it is saved', { skip: skipWithoutChrome }, () => {
  let app: App;

  before(async () => {
    app = await startApp('split-check', {
      viewport: { width: 700, height: 1300 },
      library: [PUZZLE],
      prepare: async (page) => {
        await page.evaluateOnNewDocument(FAKE_ENGINE);
      },
    });
  });
  after(async () => {
    await app?.close();
  });

  it('a puzzle KataGo disagrees with shows what it found, and the author chooses', async () => {
    const { page } = app;
    await openEditor(page);
    await page.evaluate("window.badMoves = ['C7']"); // the puzzle's first move, B cc
    await click(page, 'Save puzzle');
    await expectText(page, 'KataGo disagrees with part of the solution.');
    assert.match(await bodyText(page), /C7 is part of the solution/);
    await click(page, 'Keep editing');
    await expectNoText(page, 'KataGo disagrees');
    await click(page, 'Save puzzle');
    await expectText(page, 'Save anyway');
    await click(page, 'Save anyway');
    await expectText(page, PUZZLE.title);
    assert.doesNotMatch(await bodyText(page), /Keep editing/);
  });

  it('a puzzle KataGo agrees with is saved without a question', async () => {
    const { page } = app;
    await page.evaluate('window.badMoves = []');
    await openEditor(page, false);
    await click(page, 'Save puzzle');
    await expectText(page, PUZZLE.title);
    assert.doesNotMatch(await bodyText(page), /Keep editing|Save anyway/);
  });

  it('threw no errors', () => {
    assert.deepEqual(app.errors, []);
  });
});

describe('without the desktop app', { skip: skipWithoutChrome }, () => {
  let app: App;
  before(async () => {
    app = await startApp('split-none', { viewport: { width: 700, height: 1100 }, library: [PUZZLE] });
  });
  after(async () => {
    await app?.close();
  });

  it('Explore has no Split off button', async () => {
    const { page } = app;
    await click(page, 'Browse');
    await page.evaluate(`document.querySelector('[aria-label="Play ${PUZZLE.title}"]').click()`);
    await click(page, 'Explore');
    await expectText(page, 'Forward ›');
    assert.doesNotMatch(await bodyText(page), /Split off/);
    assert.deepEqual(app.errors, []);
  });
});

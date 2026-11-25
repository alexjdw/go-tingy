/**
 * Journey test for the backlog setting and guided learning's auto mode: choose puzzles in Settings, see them first in
 * the guided list, start auto mode. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, clickAria, bodyText, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';

const SGF = '(;GM[1]SZ[19]PL[B];B[pd];W[qf];B[qc](;W[rc]TE[1])(;W[pc]TE[1]))';
const LIB = ['Alpha', 'Bravo', 'Charlie'].map((title) => ({ id: `p-${title}`, title, sgf: SGF }));
const LEARNING = {
  version: 1,
  spaced: {},
  learning: Object.fromEntries(LIB.map((p) => [p.id, true])),
  // Alpha has cleared its guided stage, so Bravo and Charlie are the ones that need the most work
  scores: { 'p-Alpha': { guided: { free: 0, cleared: true } } },
  attempts: {},
};

async function typeInto(page: Page, label: string, text: string) {
  const sel = `[aria-label=${JSON.stringify(label)}]`;
  await page.waitForSelector(sel);
  await page.click(sel, { count: 3 });
  await page.keyboard.press('Backspace');
  await page.type(sel, text);
  await page.keyboard.press('Tab'); // leaving the field commits it
  await sleep(300);
}

describe('backlog and auto mode in the browser', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('backlog', {
      viewport: { width: 700, height: 1100 },
      library: LIB,
      prepare: async (p) => {
        await p.evaluateOnNewDocument((l) => {
          if (!localStorage.getItem('learning.v1')) localStorage.setItem('learning.v1', JSON.stringify(l));
        }, LEARNING);
      },
    });
    ({ page, errors } = app);
  });

  after(async () => {
    await app?.close();
  });

  it('has the count and the days in Settings, 5 and 7 at first', async () => {
    await click(page, 'Settings');
    await expectText(page, 'Work through a backlog');
    const v = (await page.evaluate(
      `['Puzzles','Days'].map((l) => document.querySelector('[aria-label="' + l + '"]').value)`,
    )) as string[];
    assert.deepEqual(v, ['5', '7']);
  });

  it('lists the puzzles that need the most work first, and lets the player choose only as many as set', async () => {
    await typeInto(page, 'Puzzles', '2');
    await typeInto(page, 'Days', '3');
    await click(page, 'Choose puzzles');
    await expectText(page, 'Choose 2 puzzles');
    await expectText(page, '0 of 2 chosen · priority for 3 days');
    const t = await bodyText(page);
    assert.ok(t.indexOf('Alpha') > t.indexOf('Bravo') && t.indexOf('Alpha') > t.indexOf('Charlie'), 'Alpha is last');
    await clickAria(page, 'Choose Charlie');
    await clickAria(page, 'Choose Alpha');
    await expectText(page, '2 of 2 chosen');
    const blocked = await page.evaluate(
      `document.querySelector('[aria-label="Choose Bravo"]').getAttribute('aria-disabled')`,
    );
    assert.equal(blocked, 'true', 'the limit is reached');
    await clickAria(page, 'Unchoose Alpha');
    await clickAria(page, 'Choose Bravo');
    await click(page, 'Confirm');
    await expectText(page, 'Work through a backlog');
  });

  it('shows the priority puzzles first in the guided list, and keeps them across a reload', async () => {
    for (const reload of [false, true]) {
      if (reload) {
        await page.reload({ waitUntil: 'networkidle0' });
        await sleep(800);
      } else await click(page, '‹ Back');
      await click(page, 'Guided Learning');
      await expectText(page, 'Priority · 3d left');
      const t = await bodyText(page);
      assert.ok(t.indexOf('Alpha') > t.indexOf('Bravo') && t.indexOf('Alpha') > t.indexOf('Charlie'));
      assert.equal(t.match(/Priority/g)?.length, 2);
      if (!reload) await click(page, '‹ Back');
    }
  });

  it('auto mode picks puzzles and opens a guided run', async () => {
    await click(page, 'Auto');
    await expectText(page, 'How many puzzles');
    await click(page, 'Start auto mode');
    await expectText(page, /Guided learning · \d+ free move/);
    // the first puzzle is one of the lowest level (Alpha is higher, so never first)
    const t = await bodyText(page);
    assert.doesNotMatch(t.split('Guided learning')[0], /Alpha/);
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

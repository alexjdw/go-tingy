/**
 * Paper mode in the browser: a double tap turns the diagram over to the numbered solution, and again back.
 * Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, clickAria, bodyText, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';

const SGF = '(;GM[1]SZ[19]PL[B]AB[pd]AW[qf];B[qc];W[rc];B[pc])';
const PUZZLE = { id: 'c-paper', title: 'Paper puzzle', sgf: SGF };

describe('paper mode in the browser', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;

  before(async () => {
    app = await startApp('paper', {
      library: [PUZZLE],
      prepare: async (p) => {
        await p.evaluateOnNewDocument(() => {
          localStorage.setItem('settings.v1', JSON.stringify({ paper: 'on', flipColors: 'off', markChoices: 'off' }));
        });
      },
    });
    page = app.page;
  });

  after(async () => {
    await app?.close();
  });

  it('double tap shows the numbered solution, and double tap again goes back', async () => {
    await click(page, 'Browse');
    await clickAria(page, `Play ${PUZZLE.title}`);
    await click(page, 'Solve');
    await expectText(page, 'then tap Done');
    const diagram = '[aria-label="Diagram: double tap to turn it over"]';
    const double = async () => {
      await page.click(diagram);
      await sleep(80);
      await page.click(diagram);
      await sleep(300);
    };
    await double();
    await expectText(page, 'The solution, numbered in order');
    const labels = (await page.evaluate(
      `[...document.querySelectorAll('svg text')].map((t) => t.textContent)`,
    )) as string[];
    assert.deepEqual(labels.filter((t) => /^\d+$/.test(t ?? '')).sort(), ['1', '2', '3']);
    await double();
    assert.match(await bodyText(page), /then tap Done/);
  });
});

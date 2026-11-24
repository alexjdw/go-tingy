/**
 * Journey test for collections: importing several puzzles asks for a collection name, collections hold folders,
 * and a collection can be renamed. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, clickAria, bodyText, sleep } from '../lib/web';
import type { Page } from 'puppeteer-core';

const SGF = (n: number) => `(;GM[1]SZ[9]PL[B]AB[a${'abcdefghi'[n]}]AW[bb](;B[cc]))`;
const SEEDED = [
  { id: 'c-1', title: 'Peep one', sgf: SGF(0), collection: 'Tesuji', folder: 'Part 1/Peep' },
  { id: 'c-2', title: 'Clamp one', sgf: SGF(1), collection: 'Tesuji', folder: 'Part 1/Clamp' },
  { id: 'c-3', title: 'Dent one', sgf: SGF(2), collection: 'Tesuji', folder: 'Part 2' },
];

/** Replace the text of the input with this aria-label. */
async function typeInto(page: Page, label: string, text: string) {
  const sel = `[aria-label=${JSON.stringify(label)}]`;
  await page.waitForSelector(sel);
  await page.click(sel, { count: 3 });
  await page.keyboard.press('Backspace');
  await page.type(sel, text);
  await sleep(200);
}

describe('collections', { skip: skipWithoutChrome }, () => {
  let app: App;
  let page: Page;
  let errors: string[];

  before(async () => {
    app = await startApp('collections', { viewport: { width: 700, height: 1100 }, library: SEEDED });
    ({ page, errors } = app);
    await click(page, 'Browse');
  });

  after(async () => {
    await app?.close();
  });

  it('opens folders inside a collection and goes back up', async () => {
    await click(page, 'Tesuji (3)');
    await expectText(page, 'Part 1 (2)');
    await click(page, 'Part 1 (2)');
    await expectText(page, 'Peep (1)');
    await expectText(page, 'Clamp (1)');
    assert.doesNotMatch(await bodyText(page), /Dent one/);
    await click(page, 'Peep (1)');
    await expectText(page, 'Peep one');
    assert.doesNotMatch(await bodyText(page), /Clamp one/);
    await clickAria(page, 'Up one folder');
    await expectText(page, 'Clamp one');
  });

  it('asks for a collection name when several puzzles are imported', async () => {
    await click(page, 'All puzzles');
    await clickAria(page, 'Import SGF files');
    await page.type('textarea', `${SGF(3)} ${SGF(4)} ${SGF(5)}`);
    await click(page, 'Add pasted text');
    await expectText(page, '3 found');
    await click(page, 'Import 3');
    await expectText(page, 'Name this collection');
    await typeInto(page, 'Collection name', 'My new set');
    await click(page, 'Import 3');
    await expectText(page, 'My new set (3)');
    await expectText(page, 'Tesuji (3)');
  });

  it('a single puzzle is imported without asking', async () => {
    await clickAria(page, 'Import SGF files');
    await page.type('textarea', SGF(6));
    await click(page, 'Add pasted text');
    await click(page, 'Import 1');
    await expectText(page, '11 puzzles');
    assert.doesNotMatch(await bodyText(page), /Name this collection/);
  });

  it('renames a collection', async () => {
    await click(page, 'My new set (3)');
    await click(page, 'Rename collection');
    await typeInto(page, 'Collection name', 'Renamed set');
    await click(page, 'Save name');
    await expectText(page, 'Renamed set (3)');
    assert.doesNotMatch(await bodyText(page), /My new set/);
  });

  it('Add puzzles can add a whole collection, or one folder of it, at once', async () => {
    await click(page, '‹ Back');
    await click(page, 'Guided Learning');
    await click(page, 'Add puzzles');
    await expectText(page, '0 added so far');
    assert.doesNotMatch(await bodyText(page), /Add all/, 'no bulk button until a collection is chosen');
    await click(page, 'Tesuji (3)');
    await click(page, 'Part 1 (2)');
    await click(page, 'Add all 2 from this folder');
    await expectText(page, '2 added so far');
    await expectText(page, 'All added');
    await click(page, '‹ Tesuji');
    await expectText(page, 'Add all 1 from this collection');
    await click(page, 'Add all 1 from this collection');
    await expectText(page, '3 added so far');
    await click(page, '✓ All added · Remove all from this collection');
    await expectText(page, '0 added so far');
  });

  it('threw no errors', () => {
    assert.deepEqual(errors, []);
  });
});

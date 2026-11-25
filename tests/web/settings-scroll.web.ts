/** The Settings page scrolls when it is taller than the screen. Run with `npm run test:web`. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type App, startApp, skipWithoutChrome, expectText, click, sleep } from '../lib/web';

describe('settings page', { skip: skipWithoutChrome }, () => {
  let app: App;
  before(async () => {
    app = await startApp('settings-scroll', { viewport: { width: 390, height: 420 } });
  });
  after(async () => {
    await app?.close();
  });

  it('can be scrolled down to its last button', async () => {
    const { page } = app;
    await click(page, 'Settings');
    await expectText(page, 'Paper mode');
    await page.mouse.move(195, 250);
    await page.mouse.wheel({ deltaY: 2000 });
    await sleep(500);
    const bottom = (await page.evaluate(
      `(() => { const b = [...document.querySelectorAll('[role=button], div')].find((e) => e.textContent === 'About and licenses' && e.children.length <= 1); return b ? b.getBoundingClientRect().bottom : -1; })()`,
    )) as number;
    assert.ok(bottom > 0 && bottom <= 420, `About and licenses is not on screen (bottom ${bottom})`);
  });
});

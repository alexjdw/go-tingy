/**
 * Journey test for Google Drive sync: two devices (two separate browser profiles) share one fake Drive. The Google
 * sign-in script and the Drive requests are replaced in the page, so it runs offline. Run with `npm run test:web`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BrowserContext, HTTPRequest, Page } from 'puppeteer-core';
import { type Site, click, clickAria, expectNoText, expectText, skipWithoutChrome, sleep, startSite } from '../lib/web';

const PUZZLE = { id: 'c-1-a', title: 'Synced puzzle one', sgf: '(;GM[1]SZ[19]PL[B]AB[dd]AW[cd];B[ed]TE[1])' };
const SECOND = { id: 'c-2-b', title: 'Second device puzzle', sgf: '(;GM[1]SZ[19]PL[B]AB[pp]AW[pq];B[qp]TE[1])' };

/** A one-file Drive: what the app reads and writes through the Drive API. */
class FakeDrive {
  text: string | null = null;
  writes = 0;
  async handle(req: HTTPRequest) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    const json = (o: unknown) =>
      req.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    const url = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    assert.equal(req.headers().authorization, 'Bearer fake-token', 'every Drive request carries the token');
    if (req.method() === 'GET' && url.includes('spaces=appDataFolder'))
      return json({ files: this.text ? [{ id: 'f1' }] : [] });
    if (req.method() === 'GET' && url.includes('alt=media'))
      return req.respond({ status: 200, contentType: 'application/json', headers: cors, body: this.text ?? '' });
    const body = req.postData() ?? '';
    if (req.method() === 'POST') {
      const parts = body.split(/--go-flashcards-boundary/).filter((p) => p.includes('Content-Type'));
      assert.match(parts[0], /appDataFolder/, 'the file goes in the app-private folder');
      this.text = parts[1].replace(/^[\s\S]*?\r\n\r\n/, '').replace(/\r\n$/, '');
      this.writes++;
      return json({ id: 'f1' });
    }
    if (req.method() === 'PATCH') {
      this.text = body;
      this.writes++;
      return json({});
    }
    return req.respond({ status: 404, headers: cors });
  }
}

/** Replaces Google's sign-in script, so "Sign in with Google" succeeds at once. */
const FAKE_GOOGLE = `window.google = { accounts: { oauth2: {
  initTokenClient: (c) => ({ requestAccessToken: () => { window.__tokenRequests = (window.__tokenRequests || 0) + 1; setTimeout(() => c.callback({ access_token: 'fake-token', expires_in: 3600 }), 20); } }),
  revoke: () => {},
} } };`;

describe('syncing with Google Drive in the browser', { skip: skipWithoutChrome }, () => {
  let site: Site;
  const drive = new FakeDrive();
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];

  before(async () => {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    site = await startSite('sync');
  });
  after(async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    await site?.close();
  });

  /** A new device: its own storage, the fake Google, the fake Drive. */
  async function device(library: object[]): Promise<Page> {
    const ctx = await site.browser.createBrowserContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 1000 });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument(FAKE_GOOGLE);
    await page.evaluateOnNewDocument((lib) => {
      if (!localStorage.getItem('library.v1')) localStorage.setItem('library.v1', JSON.stringify(lib));
    }, library);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('https://www.googleapis.com/')) void drive.handle(req);
      else void req.continue();
    });
    await page.goto(site.url, { waitUntil: 'networkidle0' });
    await sleep(500);
    return page;
  }

  const openSettings = async (page: Page) => {
    await click(page, 'Settings');
    await expectText(page, 'Sync with Google Drive');
  };

  /** What the cloud icon on the home screen says (null when there is none). */
  const indicator = (page: Page) =>
    page.evaluate(
      `(() => { const e = document.querySelector('[aria-label^="Google Drive:"]'); return e ? e.getAttribute('aria-label') : null; })()`,
    ) as Promise<string | null>;

  let one: Page;
  let two: Page;

  it("offers sync in Settings, and uploads this device's puzzles after signing in", async () => {
    one = await device([PUZZLE]);
    assert.equal(await indicator(one), 'Google Drive: not signed in', 'the home screen says so before signing in');
    await openSettings(one);
    await click(one, 'Sign in with Google');
    await expectText(one, /Last synced: (?!not yet)/);
    assert.ok(drive.text, 'a file was created in the fake Drive');
    assert.equal(drive.writes, 1);
    assert.ok(drive.text.includes(PUZZLE.id));
    await one.goBack();
    assert.equal(await indicator(one), 'Google Drive: signed in');
    await openSettings(one);
  });

  it("a second device gets the first one's puzzles after signing in", async () => {
    two = await device([SECOND]);
    await openSettings(two);
    await click(two, 'Sign in with Google');
    await expectText(two, /Last synced: (?!not yet)/);
    await two.goBack();
    await click(two, 'Browse');
    await expectText(two, PUZZLE.title);
    await expectText(two, SECOND.title);
  });

  it("the first device gets the second one's puzzle on the next sync, and nothing is uploaded when nothing changed", async () => {
    await click(one, 'Sync now');
    await expectText(one, /Last synced: (?!not yet)/);
    await one.goBack();
    await click(one, 'Browse');
    await expectText(one, SECOND.title);
    const writes = drive.writes;
    await one.goBack();
    await openSettings(one);
    await click(one, 'Sync now');
    await sleep(800);
    assert.equal(drive.writes, writes, 'nothing changed, so nothing was uploaded');
  });

  const requests = (page: Page) => page.evaluate('window.__tokenRequests || 0') as Promise<number>;

  it('reloading the page syncs with the saved token and never asks Google again', async () => {
    await two.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    assert.equal(await requests(two), 0, 'Google was not asked for a token, so no sign-in window');
    assert.equal(await indicator(two), 'Google Drive: signed in');
    await openSettings(two);
    await expectText(two, /Last synced: (?!not yet)/);
    await two.goBack();
  });

  it('without a usable token it does not pop up Google on its own: the cloud turns amber and a tap signs in', async () => {
    await two.evaluate("sessionStorage.removeItem('gdrive.token')");
    await two.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    assert.equal(await requests(two), 0, 'nothing was requested by itself');
    assert.equal(await indicator(two), 'Google Drive: sign in again');
    await clickAria(two, 'Google Drive: sign in again');
    await sleep(800);
    assert.equal(await requests(two), 1, 'the tap asked Google once');
    assert.equal(await indicator(two), 'Google Drive: signed in');
  });

  it('signing out stops syncing and offers to sign in again', async () => {
    await click(one, 'Sign out');
    await expectText(one, 'Sign in with Google');
    await expectNoText(one, 'Sync now');
    await one.goBack();
    assert.equal(await indicator(one), 'Google Drive: not signed in');
  });

  it('threw no errors', async () => {
    assert.deepEqual(errors, []);
    for (const c of contexts) await c.close();
  });
});

/**
 * Draft store screenshots, rendered from the real web build at the sizes the stores ask for. Run:
 *   npm run assets:screenshots
 * Output goes to store/screenshots/<device>/NN-name.png (git-ignored: regenerate any time).
 *
 * These are drafts. They show the real UI, but fonts and safe areas come from a desktop browser. For the final
 * set, prefer screenshots taken on a real device or emulator, and check each store's current size rules.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from 'puppeteer-core';
import { findChrome } from './lib/chrome';
import { buildWeb, clickText, serveDir, sleep } from './lib/web';

// [folder, CSS width, CSS height, device scale] -> pixel size = css * scale
const DEVICES: [string, number, number, number][] = [
  ['iphone-6.9in-1320x2868', 440, 956, 3],
  ['ipad-13in-2064x2752', 1032, 1376, 2],
  ['android-phone-1080x1920', 360, 640, 3],
];

// What a person who has been using the app for a while would see.
const DAY = 86_400_000;
const attempt = (correct: boolean, ago: number) => ({ correct, ms: 6000, parMs: 12000, at: Date.now() - ago });
const PROGRESS = {
  'sample-capture-1': Array.from({ length: 6 }, (_, i) => attempt(true, (6 - i) * DAY)),
  'sample-capture-2': [attempt(false, 3 * DAY), attempt(true, 2 * DAY), attempt(true, DAY)],
  'sample-capture-3': [attempt(false, DAY), attempt(false, DAY / 2)],
};
const MASTERY = {
  version: 1,
  spaced: { 'sample-capture-1': true, 'sample-capture-2': true, 'sample-capture-3': true },
  mastery: { 'sample-capture-4': true, 'sample-capture-1': true },
  scores: {
    'sample-capture-4': { guided: { free: 0, cleared: true } },
    'sample-capture-1': {
      guided: { free: 0, cleared: true },
      best: { score: 12.4, level: 'gold', moves: 3, mistakes: 0, ms: 14500, lines: 1, at: Date.now() - DAY },
    },
  },
  attempts: {},
};

// [file name, the buttons to press from the home screen, in order]
const SHOTS: [string, string[]][] = [
  ['01-home', []],
  ['02-browse', ['Browse']],
  ['03-add-to-modes', ['Browse', '+']],
  ['04-mastery', ['Mastery']],
  ['05-add-puzzles', ['Mastery', 'Add puzzles']],
  ['06-review-session', ['Spaced repetition']],
  ['07-prune', ['Spaced repetition', '‹ End', 'Prune puzzles']],
  ['08-play', ['Browse', 'Play']],
];

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-shots-'));
  console.log('building the web app…');
  buildWeb(outDir);
  const site = await serveDir(outDir);
  const browser = await launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    for (const [folder, w, h, scale] of DEVICES) {
      const dir = path.join('store', 'screenshots', folder);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
      await page.evaluateOnNewDocument(
        (progress, mastery) => {
          localStorage.setItem('progress.v1', JSON.stringify(progress));
          localStorage.setItem('mastery.v1', JSON.stringify(mastery));
        },
        PROGRESS,
        MASTERY,
      );
      for (const [name, clicks] of SHOTS) {
        // every shot starts from the home screen
        await page.goto(site.url, { waitUntil: 'networkidle0' });
        await sleep(700);
        for (const text of clicks) {
          if (!(await clickText(page, text))) throw new Error(`${folder}/${name}: could not find "${text}"`);
        }
        await page.screenshot({ path: path.join(dir, `${name}.png`) });
        console.log(`wrote ${dir}/${name}.png`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    site.close();
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

void main();

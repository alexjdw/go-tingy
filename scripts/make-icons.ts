/**
 * Generates every icon and store graphic from one design (a wood board with a black and a white stone,
 * matching the in-app board), rendered through headless Chrome. Run: `npm run assets:icons`.
 *
 * Outputs:
 *   assets/icon.png                       1024, no alpha (App Store requires an opaque icon)
 *   assets/android-icon-foreground.png    1024, stones on transparent, inside the adaptive-icon safe zone
 *   assets/android-icon-background.png    1024, wood and grid
 *   assets/android-icon-monochrome.png    1024, one-color silhouette for themed icons
 *   assets/splash-icon.png                1024, rounded tile on transparent
 *   assets/favicon.png                    64
 *   store/assets/play-icon-512.png        512 icon for the Play Console
 *   store/assets/feature-graphic-1024x500.png  Play feature graphic
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from 'puppeteer-core';
import { PNG } from 'pngjs';
import { findChrome } from './lib/chrome';

const WOOD_A = '#efc069';
const WOOD_B = '#dba24a';
const LINE = '#5a4210';
const DARK = '#14161a';

const DEFS = `
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${WOOD_A}"/><stop offset="1" stop-color="${WOOD_B}"/>
  </linearGradient>
  <radialGradient id="blk" cx="35%" cy="30%" r="75%">
    <stop offset="0" stop-color="#5c5c5c"/><stop offset=".45" stop-color="#1b1b1b"/><stop offset="1" stop-color="#000"/>
  </radialGradient>
  <radialGradient id="wht" cx="35%" cy="30%" r="80%">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f2f0e9"/><stop offset="1" stop-color="#c8c4b6"/>
  </radialGradient>
  <filter id="sh" x="-30%" y="-30%" width="170%" height="170%">
    <feDropShadow dx="10" dy="16" stdDeviation="14" flood-color="#000" flood-opacity="0.45"/>
  </filter>`;

const GRID = [192, 352, 512, 672, 832]
  .map(
    (n) =>
      `<line x1="${n}" y1="150" x2="${n}" y2="874" stroke="${LINE}" stroke-width="7"/>` +
      `<line x1="150" y1="${n}" x2="874" y2="${n}" stroke="${LINE}" stroke-width="7"/>`,
  )
  .join('');

const STONES = `
  <circle cx="362" cy="382" r="190" fill="url(#blk)" filter="url(#sh)"/>
  <circle cx="662" cy="642" r="190" fill="url(#wht)" filter="url(#sh)"/>`;

const BOARD = `<rect width="1024" height="1024" fill="url(#wood)"/>${GRID}`;
/** Stones shrunk toward the center so they sit inside Android's adaptive-icon safe zone. */
const SAFE_STONES = `<g transform="translate(512 512) scale(0.8) translate(-512 -512)">${STONES}</g>`;

const svg = (body: string, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024"><defs>${DEFS}</defs>${body}</svg>`;

const ASSETS: { out: string; size: number; svg: string; opaque: boolean }[] = [
  { out: 'assets/icon.png', size: 1024, svg: svg(BOARD + STONES), opaque: true },
  { out: 'assets/android-icon-background.png', size: 1024, svg: svg(BOARD), opaque: true },
  { out: 'assets/android-icon-foreground.png', size: 1024, svg: svg(SAFE_STONES), opaque: false },
  {
    out: 'assets/android-icon-monochrome.png',
    size: 1024,
    svg: svg(
      `<g transform="translate(512 512) scale(0.8) translate(-512 -512)">
        <circle cx="362" cy="382" r="190" fill="#000"/>
        <circle cx="662" cy="642" r="176" fill="none" stroke="#000" stroke-width="30"/>
      </g>`,
    ),
    opaque: false,
  },
  {
    out: 'assets/splash-icon.png',
    size: 1024,
    svg: svg(
      `<clipPath id="r"><rect width="1024" height="1024" rx="224"/></clipPath><g clip-path="url(#r)">${BOARD}${STONES}</g>`,
    ),
    opaque: false,
  },
  {
    out: 'assets/favicon.png',
    size: 64,
    svg: svg(
      `<clipPath id="r"><rect width="1024" height="1024" rx="224"/></clipPath><g clip-path="url(#r)">${BOARD}${STONES}</g>`,
      64,
    ),
    opaque: false,
  },
  { out: 'store/assets/play-icon-512.png', size: 512, svg: svg(BOARD + STONES, 512), opaque: true },
];

/** Re-encode as 8-bit RGB (no alpha channel), flattening onto `bg`. */
function toRgb(buf: Buffer, bg = [0xe8, 0xb5, 0x5a]): Buffer {
  const png = PNG.sync.read(buf);
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(png.data[i + c] * a + bg[c] * (1 - a));
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png, { colorType: 2, inputColorType: 6, inputHasAlpha: true });
}

const FEATURE = `<!doctype html><html><body style="margin:0;width:1024px;height:500px;overflow:hidden;
  background:linear-gradient(135deg,#1c2028,${DARK});font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;position:relative">
  <div style="position:absolute;left:64px;top:150px;color:#fff">
    <div style="font-size:66px;font-weight:800;letter-spacing:-1px;white-space:nowrap">Go Flashcards</div>
    <div style="font-size:34px;color:#c9ced8;margin-top:14px">Train tsumego &amp; joseki<br>from any SGF</div>
  </div>
  <div style="position:absolute;right:56px;top:60px;width:380px;height:380px;border-radius:58px;overflow:hidden;
       box-shadow:0 20px 50px rgba(0,0,0,.55)">
    <svg xmlns="http://www.w3.org/2000/svg" width="380" height="380" viewBox="0 0 1024 1024"><defs>${DEFS}</defs>${BOARD}${STONES}</svg>
  </div>
</body></html>`;

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  const browser = await launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  const write = (rel: string, data: Buffer) => {
    fs.mkdirSync(path.dirname(rel), { recursive: true });
    fs.writeFileSync(rel, data);
    console.log(`wrote ${rel} (${Math.round(data.length / 1024)} KB)`);
  };
  try {
    const page = await browser.newPage();
    for (const a of ASSETS) {
      await page.setViewport({ width: a.size, height: a.size, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0;background:transparent">${a.svg}</body>`);
      const shot = Buffer.from(await page.screenshot({ type: 'png', omitBackground: true }));
      write(a.out, a.opaque ? toRgb(shot) : shot);
    }
    await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
    await page.setContent(FEATURE);
    write('store/assets/feature-graphic-1024x500.png', toRgb(Buffer.from(await page.screenshot({ type: 'png' }))));
  } finally {
    await browser.close();
  }
}

void main();

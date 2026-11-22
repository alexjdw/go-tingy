import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Page } from 'puppeteer-core';

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

/** Export the web build of the app into `outDir` (takes about half a minute). */
export function buildWeb(outDir: string) {
  execSync(`npx expo export --platform web --output-dir "${outDir}"`, { cwd: process.cwd(), stdio: 'pipe' });
}

/** Serve an exported web build on a free port. Unknown paths get index.html (single-page app). */
export async function serveDir(dir: string): Promise<{ url: string; close: () => void }> {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    const ok = f.startsWith(root) && fs.existsSync(f) && !fs.statSync(f).isDirectory();
    const file = ok ? f : path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, r));
  return { url: `http://localhost:${(server.address() as { port: number }).port}/`, close: () => server.close() };
}

/** In-page function: click the button whose text is exactly the argument. Returns whether it found one. */
export const CLICK_TEXT = `((t) => {
  const els = [...document.querySelectorAll('div, span')].filter((e) => e.children.length === 0 && e.innerText && e.innerText.trim() === t);
  for (const e of els) {
    let n = e;
    while (n && n.getAttribute && n.getAttribute('role') !== 'button' && n.tabIndex !== 0) n = n.parentElement;
    (n || e).click();
    return true;
  }
  return false;
})`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Click a button by its text, then wait for the UI to settle. Returns false if there is no such button. */
export async function clickText(page: Page, text: string, settleMs = 500): Promise<boolean> {
  const ok = (await page.evaluate(`${CLICK_TEXT}(${JSON.stringify(text)})`)) as boolean;
  await sleep(settleMs);
  return ok;
}

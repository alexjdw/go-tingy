import fs from 'node:fs';

/** Where a Chrome/Chromium/Edge executable usually lives. CHROME_PATH overrides. */
export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export const findChrome = (): string | undefined => CHROME_CANDIDATES.find((p) => p && fs.existsSync(p));

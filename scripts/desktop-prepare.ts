/**
 * `npm run desktop:prepare`: export the web build of the app into desktop/web and copy the icon, ready for
 * `npm run dist:win` or `npm run dist:mac` inside desktop/ (see the README, "Desktop").
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

fs.rmSync('desktop/web', { recursive: true, force: true });
execSync('npx expo export --platform web --output-dir desktop/web', { stdio: 'inherit' });
fs.mkdirSync('desktop/build', { recursive: true });
fs.copyFileSync('assets/icon.png', 'desktop/build/icon.png');
console.log('desktop/web and desktop/build/icon.png are ready');

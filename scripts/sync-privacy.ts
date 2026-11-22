/**
 * `npm run privacy:sync`: write the "required reason" API declarations that the installed native packages
 * ship into app.json (ios.privacyManifests), together with "no tracking, no collected data" (matching
 * store/privacy-answers.md). Run it after adding or upgrading a native dependency.
 */
import fs from 'node:fs';
import { collectInstalledReasons, toAppJson } from './store/privacy';

const file = 'app.json';
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
const { reasons, files } = collectInstalledReasons();
app.expo.ios ??= {};
app.expo.ios.privacyManifests = {
  NSPrivacyTracking: false,
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: toAppJson(reasons),
};
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
console.log(`Wrote ${Object.keys(reasons).length} API categories from ${files.length} package manifests into ${file}.`);

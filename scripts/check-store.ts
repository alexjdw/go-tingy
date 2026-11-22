/** `npm run check:store`: are we ready to build for the stores? Exits 1 if anything blocks a submission. */
import fs from 'node:fs';
import path from 'node:path';
import { checkStoreReadiness } from './store/checks';

const root = process.cwd();
const json = (rel: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
};

const findings = checkStoreReadiness({
  appJson: json('app.json'),
  packageJson: json('package.json'),
  easJson: json('eas.json'),
  storeConfig: json('store.config.json'),
  playListing: json('store/play-listing.json'),
  readFile: (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel));
    } catch {
      return null;
    }
  },
});

const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');
for (const f of errors) console.log(`✖ ${f.message}`);
for (const f of warns) console.log(`! ${f.message}`);
console.log(
  errors.length
    ? `\n${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before submitting (${warns.length} warning${warns.length === 1 ? '' : 's'}).`
    : `\nReady: nothing in the repo blocks a submission (${warns.length} warning${warns.length === 1 ? '' : 's'}). See store/CHECKLIST.md for the steps only you can do.`,
);
process.exit(errors.length ? 1 : 0);

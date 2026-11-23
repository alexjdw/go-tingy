import { NOTICES } from '../src/data/notices';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { type Inputs, checkStoreReadiness } from '../scripts/store/checks';
import { packagesInSources } from '../scripts/store/bundle';
import { type Dep, isAcceptable, licenseOf, renderNotices } from '../scripts/store/licenses';

describe('license audit: reading a package license', () => {
  it('reads the common forms', () => {
    assert.equal(licenseOf({ license: 'MIT' }), 'MIT');
    assert.equal(licenseOf({ license: { type: 'ISC', url: 'x' } }), 'ISC');
    assert.equal(licenseOf({ licenses: [{ type: 'MIT' }] }), 'MIT');
    assert.equal(licenseOf({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }), '(MIT OR Apache-2.0)');
    assert.equal(licenseOf({}), 'UNKNOWN');
    assert.equal(licenseOf({ license: 42 }), 'UNKNOWN');
  });
});

describe('license audit: is it fine for a closed-source app?', () => {
  it('accepts permissive licenses', () => {
    for (const l of [
      'MIT',
      'ISC',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'Apache-2.0',
      '0BSD',
      'BlueOak-1.0.0',
      'Unlicense',
      'CC0-1.0',
    ]) {
      assert.equal(isAcceptable(l), true, l);
    }
  });

  it('rejects copyleft and unknown licenses', () => {
    for (const l of [
      'GPL-3.0',
      'GPL-2.0-only',
      'AGPL-3.0',
      'LGPL-2.1',
      'MPL-2.0',
      'EPL-2.0',
      'SSPL-1.0',
      'UNKNOWN',
      'SEE LICENSE IN LICENSE',
      '',
    ]) {
      assert.equal(isAcceptable(l), false, l);
    }
  });

  it('for "A OR B" one acceptable choice is enough; for "A AND B" both must be', () => {
    assert.equal(isAcceptable('(MIT OR GPL-3.0)'), true);
    assert.equal(isAcceptable('(BSD-3-Clause OR GPL-2.0)'), true);
    assert.equal(isAcceptable('(Unlicense OR Apache-2.0)'), true);
    assert.equal(isAcceptable('(GPL-2.0 OR MPL-2.0)'), false);
    assert.equal(isAcceptable('(MIT AND Apache-2.0)'), true);
    assert.equal(isAcceptable('(MIT AND GPL-3.0)'), false);
  });
});

describe('license audit: which packages are in a bundle', () => {
  it('finds packages, scoped packages and nested copies, from POSIX and Windows paths', () => {
    const sources = [
      '/proj/node_modules/react/index.js',
      '/proj/node_modules/react/cjs/react.development.js',
      '/proj/node_modules/@react-native-async-storage/async-storage/src/index.ts',
      String.raw`C:\proj\node_modules\fflate\esm\browser.js`,
      '/proj/node_modules/expo/node_modules/expo-file-system/build/x.js',
      '/proj/src/App.tsx',
      '/proj/index.ts',
    ];
    assert.deepEqual(packagesInSources(sources), [
      '@react-native-async-storage/async-storage',
      'expo-file-system',
      'fflate',
      'react',
    ]);
  });

  it('ignores the app\u2019s own files and dot-directories', () => {
    assert.deepEqual(packagesInSources(['/p/src/a.ts', '/p/node_modules/.bin/x', '/p/node_modules/']), []);
  });
});

describe('license audit: the notices file', () => {
  const dep = (name: string, license: string, text: string): Dep => ({ name, version: '1.0.0', license, text });

  it('prints each distinct license text once, listing every package under it', () => {
    const md = renderNotices([
      dep('a', 'MIT', 'MIT text\n\nCopyright A'),
      dep('b', 'MIT', 'MIT text\n\nCopyright A'),
      dep('c', 'ISC', 'ISC text'),
    ]);
    assert.equal(md.split('MIT text').length - 1, 1, 'the shared text appears once');
    assert.match(md, /a@1\.0\.0, b@1\.0\.0/);
    assert.match(md, /c@1\.0\.0/);
    assert.match(md, /^# Third-party notices/);
  });

  it('says so when a package ships no license text', () => {
    assert.match(renderNotices([dep('x', 'MIT', '')]), /No license text was shipped/);
  });
});

describe('the LICENSE file and the store check', () => {
  const inputs = (license: string | null, notices: boolean): Inputs => ({
    appJson: { expo: {} },
    packageJson: {},
    easJson: null,
    storeConfig: null,
    playListing: null,
    readFile: (rel) => {
      if (rel === 'LICENSE' && license !== null) return new TextEncoder().encode(license);
      if (rel === 'THIRD_PARTY_NOTICES.md' && notices) return new TextEncoder().encode('# notices');
      return null;
    },
  });
  const found = (i: Inputs) => checkStoreReadiness(i).filter((f) => f.id === 'license' || f.id === 'notices');

  it('flags a copyright line that still has a TODO for the name', () => {
    const f = found(inputs('Copyright (c) 2026 TODO: Your Name', true));
    assert.deepEqual(
      f.map((x) => x.id),
      ['license'],
    );
    assert.match(f[0].message, /TODO/);
  });

  it('accepts a license with the holder filled in', () => {
    assert.deepEqual(found(inputs('Copyright (c) 2026 Jane Doe. All rights reserved.', true)), []);
  });

  it('warns when the third-party notices file is missing', () => {
    assert.deepEqual(
      found(inputs('Copyright (c) 2026 Jane Doe', false)).map((x) => [x.id, x.level]),
      [['notices', 'warn']],
    );
  });

  it('still flags the Expo template', () => {
    assert.deepEqual(
      found(inputs('Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)', true)).map((x) => x.id),
      ['license'],
    );
  });
});

describe('the real LICENSE', () => {
  const root = process.cwd();
  const text = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');

  it('is a personal-use license, not an open-source one', () => {
    assert.match(text, /^Go Flashcards Personal Use License/);
    assert.match(text, /NOT an open-source license/);
    assert.doesNotMatch(text, /Permission is hereby granted, free of charge/i, 'not the MIT grant');
    assert.doesNotMatch(text, /650 Industries/);
  });

  it('allows personal use and forbids commercial use and redistribution', () => {
    assert.match(text, /for Personal Use only/);
    assert.match(text, /may NOT/);
    assert.match(text, /commercial purpose/);
    assert.match(
      text,
      /make the Software, or any\s+modified version or derivative work of it, available to anyone else/,
    );
  });

  it('carves out the third-party test fixtures and points to the notices file', () => {
    assert.match(text, /tests\/fixtures\//);
    assert.match(text, /THIRD_PARTY_NOTICES\.md/);
    assert.ok(fs.existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md')), 'the notices file exists');
  });

  it('is referenced from package.json', () => {
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).license,
      'SEE LICENSE IN LICENSE',
    );
  });

  it('the notices file covers the packages that ship, and no copyleft license appears in it', () => {
    const md = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    for (const name of ['react@', 'react-native@', 'fflate@', '@zxing/text-encoding@'])
      assert.ok(md.includes(name), name);
    assert.doesNotMatch(md, /^## .*(GPL|MPL|EPL)/m);
  });

  it('the About screen shows the same notices as the file (run npm run licenses after a change)', () => {
    const md = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    assert.equal(NOTICES, md, 'src/data/notices.ts is out of date');
  });
});

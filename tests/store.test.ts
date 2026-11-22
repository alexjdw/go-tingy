import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PNG } from 'pngjs';
import { type Inputs, checkStoreReadiness, pngInfo } from '../scripts/store/checks';
import {
  collectInstalledReasons,
  declaredReasons,
  missingReasons,
  parsePrivacyInfo,
  unionReasons,
} from '../scripts/store/privacy';

const png = (w: number, h: number, alpha: boolean) => {
  const img = new PNG({ width: w, height: h });
  img.data.fill(255);
  return PNG.sync.write(img, alpha ? {} : { colorType: 2, inputColorType: 6, inputHasAlpha: true });
};

const FILES: Record<string, Uint8Array> = {
  'assets/icon.png': png(1024, 1024, false),
  'assets/android-icon-foreground.png': png(1024, 1024, true),
  'assets/android-icon-background.png': png(1024, 1024, false),
  'assets/android-icon-monochrome.png': png(1024, 1024, true),
  'assets/splash-icon.png': png(1024, 1024, true),
  'store/assets/play-icon-512.png': png(512, 512, false),
  'store/assets/feature-graphic-1024x500.png': png(1024, 500, false),
};

/** A configuration that passes every check. Tests change one thing at a time. */
const good = (): Inputs => ({
  appJson: {
    expo: {
      name: 'Go Flashcards',
      version: '1.0.0',
      orientation: 'portrait',
      icon: './assets/icon.png',
      ios: {
        bundleIdentifier: 'com.acme.goflashcards',
        supportsTablet: true,
        requireFullScreen: true,
        config: { usesNonExemptEncryption: false },
      },
      android: {
        package: 'com.acme.goflashcards',
        adaptiveIcon: {
          backgroundColor: '#e8b55a',
          foregroundImage: './assets/android-icon-foreground.png',
          monochromeImage: './assets/android-icon-monochrome.png',
        },
        blockedPermissions: ['android.permission.RECORD_AUDIO'],
      },
      plugins: [
        ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }],
        'expo-asset',
        ['expo-splash-screen', { image: './assets/splash-icon.png' }],
      ],
    },
  },
  packageJson: { dependencies: { 'expo-audio': '1', 'expo-asset': '1' } },
  easJson: { cli: { appVersionSource: 'remote' }, build: { production: { autoIncrement: true } } },
  storeConfig: {
    apple: {
      categories: ['EDUCATION'],
      advisory: {},
      info: {
        'en-US': {
          title: 'Go Flashcards',
          subtitle: 'Tsumego trainer',
          description: 'A long enough description.',
          promoText: 'Short.',
          keywords: ['go', 'sgf'],
          releaseNotes: 'First release.',
        },
      },
      review: { notes: 'No login needed.' },
    },
  },
  playListing: { title: 'Go Flashcards', shortDescription: 'Train Go puzzles.', fullDescription: 'Full text.' },
  readFile: (rel) => FILES[rel] ?? null,
});

const ids = (i: Inputs) => checkStoreReadiness(i).map((f) => f.id);
const edit = (fn: (i: Inputs) => void) => {
  const i = good();
  fn(i);
  return i;
};

describe('store readiness: PNG reader', () => {
  it('reads size and detects an alpha channel', () => {
    assert.deepEqual(pngInfo(png(64, 32, false)), { width: 64, height: 32, hasAlpha: false });
    assert.deepEqual(pngInfo(png(64, 32, true)), { width: 64, height: 32, hasAlpha: true });
  });

  it('rejects bytes that are not a PNG', () => {
    assert.equal(pngInfo(new Uint8Array(100)), null);
    assert.equal(pngInfo(new TextEncoder().encode('not a png at all, definitely not one')), null);
  });
});

describe('privacy manifest helpers', () => {
  const xml = (type: string, reasons: string[]) =>
    `<dict><key>NSPrivacyAccessedAPIType</key><string>${type}</string><key>NSPrivacyAccessedAPITypeReasons</key><array>${reasons.map((r) => `<string>${r}</string>`).join('')}</array></dict>`;

  it('parses declarations out of a PrivacyInfo.xcprivacy', () => {
    const doc = `<plist><dict><key>NSPrivacyAccessedAPITypes</key><array>${xml('CatA', ['A1', 'A2'])}${xml('CatB', ['B1'])}</array>
      <key>NSPrivacyTracking</key><false/></dict></plist>`;
    assert.deepEqual(parsePrivacyInfo(doc), { CatA: ['A1', 'A2'], CatB: ['B1'] });
    assert.deepEqual(parsePrivacyInfo('<plist><dict><key>NSPrivacyTracking</key><false/></dict></plist>'), {});
  });

  it('merges declarations from several packages, sorted and without duplicates', () => {
    assert.deepEqual(unionReasons([{ B: ['2', '1'], A: ['x'] }, { A: ['x', 'y'] }, {}]), {
      A: ['x', 'y'],
      B: ['1', '2'],
    });
  });

  it('reads the declarations from app.json and reports what is missing', () => {
    const app = {
      expo: {
        ios: {
          privacyManifests: {
            NSPrivacyAccessedAPITypes: [{ NSPrivacyAccessedAPIType: 'A', NSPrivacyAccessedAPITypeReasons: ['1'] }],
          },
        },
      },
    };
    assert.deepEqual(declaredReasons(app), { A: ['1'] });
    assert.deepEqual(missingReasons({ A: ['1', '2'], B: ['9'] }, declaredReasons(app)), ['A: 2', 'B: 9']);
    assert.deepEqual(declaredReasons({}), {});
  });
});

describe('store readiness: a correct configuration', () => {
  it('has no findings', () => {
    assert.deepEqual(checkStoreReadiness(good()), []);
  });
});

describe('store readiness: each rule', () => {
  it('requires identifiers, valid ones, and not a placeholder prefix', () => {
    assert.deepEqual(ids(edit((i) => delete i.appJson.expo.ios.bundleIdentifier)), ['ios-bundle-id']);
    assert.deepEqual(ids(edit((i) => delete i.appJson.expo.android.package)), ['android-package']);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.ios.bundleIdentifier = 'nodots'))), ['ios-bundle-id']);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.android.package = 'com.1bad.name'))), ['android-package']);
    assert.deepEqual(
      ids(edit((i) => (i.appJson.expo.android.package = 'com.my-app.x'))),
      ['android-package'],
      'hyphens are not allowed on Android',
    );
    for (const p of ['com.example.app', 'com.anonymous.go_flashcards', 'host.exp.exponent']) {
      assert.deepEqual(ids(edit((i) => (i.appJson.expo.ios.bundleIdentifier = p))), ['ios-bundle-id'], p);
    }
    assert.deepEqual(
      ids(edit((i) => (i.appJson.expo.ios.bundleIdentifier = 'com.acme.go-cards'))),
      [],
      'hyphens are fine on iOS',
    );
  });

  it('checks name length and version format', () => {
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.name = 'x'.repeat(31)))), ['name']);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.version = '1.0'))), ['version']);
  });

  it('rejects an app icon with an alpha channel or the wrong size', () => {
    assert.deepEqual(
      ids({ ...good(), readFile: (r) => (r === 'assets/icon.png' ? png(1024, 1024, true) : (FILES[r] ?? null)) }),
      ['icon'],
    );
    assert.deepEqual(
      ids({ ...good(), readFile: (r) => (r === 'assets/icon.png' ? png(512, 512, false) : (FILES[r] ?? null)) }),
      ['icon'],
    );
    assert.deepEqual(ids({ ...good(), readFile: (r) => (r === 'assets/icon.png' ? null : (FILES[r] ?? null)) }), [
      'icon',
    ]);
  });

  it('checks the Android adaptive icon and splash', () => {
    assert.deepEqual(ids(edit((i) => delete i.appJson.expo.android.adaptiveIcon.backgroundColor)), ['adaptive-icon']);
    assert.deepEqual(
      ids({
        ...good(),
        readFile: (r) => (r === 'assets/android-icon-foreground.png' ? png(300, 300, true) : (FILES[r] ?? null)),
      }),
      ['adaptive-icon'],
    );
    assert.deepEqual(
      ids({ ...good(), readFile: (r) => (r === 'assets/android-icon-monochrome.png' ? null : (FILES[r] ?? null)) }),
      ['monochrome-icon'],
    );
    assert.deepEqual(
      ids(
        edit(
          (i) =>
            (i.appJson.expo.plugins = i.appJson.expo.plugins.filter(
              (p: unknown) => !Array.isArray(p) || p[0] !== 'expo-splash-screen',
            )),
        ),
      ),
      ['splash'],
    );
  });

  it('flags the audio plugin defaults that add microphone and background access', () => {
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.plugins[0] = 'expo-audio'))), [
      'audio-microphone',
      'audio-record',
      'audio-background',
    ]);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.plugins[0][1].microphonePermission = 'Allow mic'))), [
      'audio-microphone',
    ]);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.plugins[0][1].enableBackgroundPlayback = true))), [
      'audio-background',
    ]);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.android.blockedPermissions = []))), ['blocked-permissions']);
  });

  it('requires expo-asset next to expo-audio (a store build can crash without it)', () => {
    assert.deepEqual(ids(edit((i) => delete i.packageJson.dependencies['expo-asset'])), ['expo-asset']);
  });

  it('requires the encryption declaration and the iPad full-screen setting', () => {
    assert.deepEqual(ids(edit((i) => delete i.appJson.expo.ios.config)), ['encryption']);
    assert.deepEqual(ids(edit((i) => (i.appJson.expo.ios.requireFullScreen = false))), ['ipad-orientation']);
    assert.deepEqual(
      ids(
        edit((i) => {
          i.appJson.expo.ios.requireFullScreen = false;
          i.appJson.expo.ios.supportsTablet = false;
        }),
      ),
      [],
      'iPhone-only needs no full-screen flag',
    );
    assert.deepEqual(
      ids(
        edit((i) => {
          i.appJson.expo.ios.requireFullScreen = false;
          i.appJson.expo.orientation = 'default';
        }),
      ),
      [],
      'all orientations need no flag either',
    );
  });

  it('flags the template LICENSE that credits Expo as the copyright holder', () => {
    const withLicense = (text: string): Inputs => ({
      ...good(),
      readFile: (r) => (r === 'LICENSE' ? new TextEncoder().encode(text) : (FILES[r] ?? null)),
    });
    assert.deepEqual(ids(withLicense('Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)')), ['license']);
    assert.deepEqual(ids(withLicense('Copyright (c) 2026 Someone Else')), []);
    assert.deepEqual(ids(good()), [], 'no LICENSE file at all is not flagged');
  });

  it('requires the app privacy manifest to declare every reason the native packages declare', () => {
    const required = {
      NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
      NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1', '3B52.1'],
    };
    const declared = (types: unknown[]) => (i: Inputs) => {
      i.appJson.expo.ios.privacyManifests = { NSPrivacyAccessedAPITypes: types };
      i.requiredPrivacy = required;
    };
    assert.deepEqual(ids(edit(declared([]))), ['privacy-manifest']);
    const all = [
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
        NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
      },
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
        NSPrivacyAccessedAPITypeReasons: ['C617.1', '3B52.1', '0A2A.1'],
      },
    ];
    assert.deepEqual(ids(edit(declared(all))), [], 'extra reasons are fine');
    assert.deepEqual(ids(edit(declared(all.slice(0, 1)))), ['privacy-manifest']);
    const partial = [all[0], { ...all[1], NSPrivacyAccessedAPITypeReasons: ['C617.1'] }];
    const f = checkStoreReadiness(edit(declared(partial))).find((x) => x.id === 'privacy-manifest')!;
    assert.match(f.message, /FileTimestamp: 3B52\.1/);
    assert.doesNotMatch(f.message, /UserDefaults/);
    assert.deepEqual(ids(good()), [], 'skipped when no requirement is supplied');
  });

  it('checks EAS build config', () => {
    assert.deepEqual(ids(edit((i) => (i.easJson = null))), ['eas-json']);
    assert.deepEqual(ids(edit((i) => delete i.easJson.build.production)), ['eas-production', 'eas-autoincrement']);
    assert.deepEqual(ids(edit((i) => (i.easJson.cli.appVersionSource = 'local'))), ['eas-version-source']);
  });

  it('enforces the Apple listing limits', () => {
    const info = (i: Inputs) => i.storeConfig.apple.info['en-US'];
    assert.deepEqual(ids(edit((i) => (info(i).title = 'x'.repeat(31)))), ['apple-title']);
    assert.deepEqual(ids(edit((i) => (info(i).subtitle = 'x'.repeat(31)))), ['apple-subtitle']);
    assert.deepEqual(ids(edit((i) => (info(i).promoText = 'x'.repeat(171)))), ['apple-promo']);
    assert.deepEqual(ids(edit((i) => (info(i).description = 'x'.repeat(4001)))), ['apple-description']);
    assert.deepEqual(
      ids(edit((i) => (info(i).keywords = ['a'.repeat(60), 'b'.repeat(60)]))),
      ['apple-keywords'],
      'comma-joined keywords may total 100',
    );
    assert.deepEqual(ids(edit((i) => (i.storeConfig.apple.review.notes = ''))), ['apple-review-notes']);
    assert.deepEqual(ids(edit((i) => delete i.storeConfig.apple.categories)), ['apple-categories']);
    assert.deepEqual(ids(edit((i) => delete i.storeConfig.apple.advisory)), ['apple-advisory']);
  });

  it('enforces the Google Play listing limits and graphics', () => {
    assert.deepEqual(ids(edit((i) => (i.playListing.shortDescription = 'x'.repeat(81)))), ['play-short']);
    assert.deepEqual(ids(edit((i) => (i.playListing.title = 'x'.repeat(31)))), ['play-title']);
    assert.deepEqual(ids(edit((i) => (i.playListing.fullDescription = 'x'.repeat(4001)))), ['play-full']);
    assert.deepEqual(
      ids({
        ...good(),
        readFile: (r) => (r === 'store/assets/play-icon-512.png' ? png(256, 256, false) : (FILES[r] ?? null)),
      }),
      ['play-icon'],
    );
    assert.deepEqual(
      ids({
        ...good(),
        readFile: (r) => (r === 'store/assets/feature-graphic-1024x500.png' ? null : (FILES[r] ?? null)),
      }),
      ['play-feature'],
    );
  });

  it('lists every leftover TODO placeholder by path', () => {
    const i = edit((x) => {
      x.storeConfig.apple.copyright = 'TODO: 2026 Your Name';
      x.storeConfig.apple.review.email = 'TODO';
    });
    const f = checkStoreReadiness(i).filter((x) => x.id === 'store-todo');
    assert.equal(f.length, 1);
    assert.match(f[0].message, /apple\.copyright/);
    assert.match(f[0].message, /apple\.review\.email/);
  });
});

describe('store readiness: the real repository', () => {
  const root = process.cwd();
  const json = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const real = (): Inputs => ({
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

  // Only the things that need a decision from the owner are allowed to still be open: the permanent app IDs and
  // the contact/URL placeholders. Everything else (icons, permissions, listing limits, build config) must pass.
  const OWNER_ITEMS = ['ios-bundle-id', 'android-package', 'store-todo', 'license'];

  it('has no blocking problems other than the items only the owner can supply', () => {
    const blocking = checkStoreReadiness(real()).filter((f) => f.level === 'error' && !OWNER_ITEMS.includes(f.id));
    assert.deepEqual(blocking, []);
  });

  it('has no warnings either', () => {
    assert.deepEqual(
      checkStoreReadiness(real()).filter((f) => f.level === 'warn'),
      [],
    );
  });

  it('declares every required-reason API the installed native packages declare (Apple privacy manifest)', () => {
    const { reasons, files } = collectInstalledReasons();
    assert.ok(files.length >= 5, 'found the packages’ PrivacyInfo.xcprivacy files');
    assert.deepEqual(missingReasons(reasons, declaredReasons(real().appJson)), []);
    assert.equal(real().appJson.expo.ios.privacyManifests.NSPrivacyTracking, false);
    assert.deepEqual(real().appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes, []);
  });

  it('never commits an invented identifier', () => {
    const { expo } = real().appJson;
    for (const id of [expo.ios?.bundleIdentifier, expo.android?.package]) {
      if (id)
        assert.doesNotMatch(
          id,
          /^(com\.anonymous|com\.example|host\.exp)/,
          'expo prebuild writes a made-up package name into app.json; do not keep it',
        );
    }
  });

  it('keeps the audio and permission settings that keep the store listing honest', () => {
    const { expo } = real().appJson;
    const audio = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-audio');
    assert.deepEqual(audio[1], {
      microphonePermission: false,
      recordAudioAndroid: false,
      enableBackgroundPlayback: false,
    });
    assert.ok(expo.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
  });
});

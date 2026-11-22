/**
 * Native configuration test: a local stand-in for "does the iOS/Android build get set up the way the stores
 * need?". It generates the real native projects (`expo prebuild`, no compiling) in throwaway directories and
 * checks what an App Store or Play reviewer, or the stores' validators, would look at.
 *
 * It cannot compile or run the app: that needs Xcode (macOS) and the Android SDK. Expo's CLI refuses to generate
 * the iOS project on Windows, so there the platform is reported as Linux for that one command; generation is just
 * file templating plus config plugins. Run with `npm run test:native` (about 30 seconds; the first run needs
 * network to fetch Expo's project template).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pngInfo } from '../../scripts/store/checks';
import { collectInstalledReasons, missingReasons, parsePrivacyInfo } from '../../scripts/store/privacy';

const root = process.cwd();
const TEST_ID = 'com.test.goflashcards';
// Scratch projects live inside the repo (git-ignored), so Node finds the real node_modules by walking up the
// parent directories. A symlink/junction to node_modules instead makes Expo's Android generation hang on Windows.
const SCRATCH = path.join(root, '.native-test');
const made: string[] = [];

/** Delete the scratch folder. A running dev server (Metro) watches the repo and can briefly lock files on
 * Windows, so retry; cleanup problems never fail a test, and the next run clears any leftovers. */
const clearScratch = () => {
  try {
    fs.rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    /* try again next run */
  }
};

/** Generate one platform's native project from this repo's real app config, in a temp dir. */
function prebuild(platform: 'ios' | 'android'): string {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const dir = fs.mkdtempSync(path.join(SCRATCH, `${platform}-`));
  made.push(dir);
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  // the real config has no app IDs yet (the owner chooses them); give the test project placeholders
  app.expo.ios.bundleIdentifier ??= TEST_ID;
  app.expo.android.package ??= TEST_ID;
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(app, null, 2));
  for (const f of ['tsconfig.json', 'index.ts']) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  // a different package name, or Metro in a running dev server reports a name collision with the real package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.name = `native-scratch-${platform}`;
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.cpSync(path.join(root, 'assets'), path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'));
  fs.copyFileSync(path.join(root, 'src', 'App.tsx'), path.join(dir, 'src', 'App.tsx'));

  const args = [
    path.join(root, 'node_modules', 'expo', 'bin', 'cli'),
    'prebuild',
    '--platform',
    platform,
    '--no-install',
  ];
  if (platform === 'ios' && process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'as-linux.js'), "Object.defineProperty(process, 'platform', { value: 'linux' });");
    args.unshift('-r', path.join(dir, 'as-linux.js'));
  }
  execFileSync(process.execPath, args, { cwd: dir, env: { ...process.env, CI: '1' }, stdio: 'pipe', timeout: 240_000 });
  return dir;
}

const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const plistBool = (xml: string, key: string) => {
  const m = new RegExp(`<key>${key}</key>\\s*<(true|false)/>`).exec(xml);
  return m ? m[1] === 'true' : undefined;
};
const plistString = (xml: string, key: string) =>
  new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];

describe('native configuration', () => {
  let ios = '';
  let android = '';

  before(() => {
    clearScratch(); // leftovers from an interrupted run
    ios = prebuild('ios');
    android = prebuild('android');
  });

  after(() => {
    clearScratch();
  });

  describe('iOS', () => {
    const app = () => path.join(ios, 'ios', 'GoFlashcards');

    it('Info.plist declares no sensitive access and no background modes', () => {
      const plist = read(app(), 'Info.plist');
      assert.doesNotMatch(plist, /<key>NS\w*UsageDescription<\/key>/, 'no microphone/camera/photos/location strings');
      assert.doesNotMatch(plist, /UIBackgroundModes/, 'no background modes (an unused one is a review rejection)');
      assert.doesNotMatch(plist, /<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/, 'App Transport Security stays on');
    });

    it('declares the export-compliance answer, so no build is held for it', () => {
      assert.equal(plistBool(read(app(), 'Info.plist'), 'ITSAppUsesNonExemptEncryption'), false);
    });

    it('opts out of iPad multitasking, which a portrait-locked iPad app must do', () => {
      const plist = read(app(), 'Info.plist');
      assert.equal(plistBool(plist, 'UIRequiresFullScreen'), true);
      assert.match(plist, /UIInterfaceOrientationPortrait/);
      assert.doesNotMatch(plist, /UIInterfaceOrientationLandscape/);
    });

    it('has the right name, version and dark interface', () => {
      const plist = read(app(), 'Info.plist');
      assert.equal(plistString(plist, 'CFBundleDisplayName'), 'Go Flashcards');
      assert.equal(plistString(plist, 'CFBundleShortVersionString'), JSON.parse(read(root, 'app.json')).expo.version);
      assert.equal(plistString(plist, 'UIUserInterfaceStyle'), 'Dark');
    });

    it('supports iPhone and iPad, uses the app ID, and asks for no capabilities', () => {
      const proj = read(ios, 'ios', 'GoFlashcards.xcodeproj', 'project.pbxproj');
      const realId = JSON.parse(read(root, 'app.json')).expo.ios.bundleIdentifier ?? TEST_ID;
      assert.match(proj, new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = "?${realId.replace(/\./g, '\\.')}"?;`));
      assert.match(proj, /TARGETED_DEVICE_FAMILY = "1,2";/, '1 = iPhone, 2 = iPad');
      assert.match(proj, /IPHONEOS_DEPLOYMENT_TARGET = \d+/);
      assert.match(read(app(), 'GoFlashcards.entitlements'), /<dict\/>/, 'no entitlements (push, iCloud, etc.)');
    });

    it('ships an opaque 1024px App Store icon (an alpha channel is rejected)', () => {
      const icon = path.join(app(), 'Images.xcassets', 'AppIcon.appiconset', 'App-Icon-1024x1024@1x.png');
      assert.deepEqual(pngInfo(fs.readFileSync(icon)), { width: 1024, height: 1024, hasAlpha: false });
    });

    it('has a launch screen with its image', () => {
      assert.ok(fs.existsSync(path.join(app(), 'SplashScreen.storyboard')));
      assert.match(read(app(), 'Info.plist'), /<key>UILaunchStoryboardName<\/key>\s*<string>SplashScreen<\/string>/);
      assert.ok(fs.existsSync(path.join(app(), 'Images.xcassets', 'SplashScreenLogo.imageset', 'image@3x.png')));
    });

    it('includes a privacy manifest that declares tracking off, nothing collected, and every required reason', () => {
      const file = path.join(app(), 'PrivacyInfo.xcprivacy');
      assert.ok(fs.existsSync(file), 'PrivacyInfo.xcprivacy was generated');
      assert.ok(
        read(ios, 'ios', 'GoFlashcards.xcodeproj', 'project.pbxproj').includes('PrivacyInfo.xcprivacy'),
        'and is part of the Xcode project',
      );
      const xml = fs.readFileSync(file, 'utf8');
      assert.equal(plistBool(xml, 'NSPrivacyTracking'), false);
      assert.match(xml, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
      const { reasons } = collectInstalledReasons();
      assert.deepEqual(
        missingReasons(reasons, parsePrivacyInfo(xml)),
        [],
        'Apple does not reliably read the pods’ own manifests',
      );
    });
  });

  describe('Android', () => {
    const manifest = () => read(android, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

    it('requests only INTERNET and MODIFY_AUDIO_SETTINGS', () => {
      const requested = [...manifest().matchAll(/<uses-permission\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((t) => !/tools:node="remove"/.test(t))
        .map((t) => /android:name="([^"]+)"/.exec(t)![1])
        .sort();
      assert.deepEqual(requested, ['android.permission.INTERNET', 'android.permission.MODIFY_AUDIO_SETTINGS']);
    });

    it('explicitly removes the permissions that libraries would otherwise add', () => {
      const removed = [
        ...manifest().matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"[^>]*tools:node="remove"/g),
      ].map((m) => m[1]);
      for (const p of [
        'RECORD_AUDIO',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'SYSTEM_ALERT_WINDOW',
        'VIBRATE',
      ]) {
        assert.ok(removed.includes(`android.permission.${p}`), p);
      }
    });

    it('has no services (no foreground or background audio)', () => {
      assert.doesNotMatch(manifest(), /<service\b/);
      assert.doesNotMatch(manifest(), /foregroundServiceType/);
    });

    it('uses the app ID as the package and application ID', () => {
      const realId = JSON.parse(read(root, 'app.json')).expo.android.package ?? TEST_ID;
      assert.match(
        read(android, 'android', 'app', 'build.gradle'),
        new RegExp(`applicationId ['"]${realId.replace(/\./g, '\\.')}['"]`),
      );
    });

    it('has an adaptive icon with foreground, background and a themed (monochrome) layer', () => {
      const xml = read(android, 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml');
      assert.match(xml, /<foreground/);
      assert.match(xml, /<background/);
      assert.match(xml, /<monochrome/);
    });
  });
});

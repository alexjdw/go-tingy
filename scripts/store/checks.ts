/**
 * Store-readiness checks: the rules the App Store and Google Play enforce (or reviewers reliably flag) that can
 * be verified from the repo. Pure functions; `npm run check:store` runs them against the real project.
 */

import { declaredReasons, missingReasons, type Reasons } from './privacy';

export type Level = 'error' | 'warn';
export interface Finding {
  level: Level;
  id: string;
  message: string;
}

export interface PngInfo {
  width: number;
  height: number;
  /** true if the image has an alpha channel or transparency (the App Store icon must not) */
  hasAlpha: boolean;
}

/** Read the header of a PNG. Returns null if the bytes aren't a PNG. */
export function pngInfo(buf: Uint8Array): PngInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33 || sig.some((b, i) => buf[i] !== b)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const colorType = buf[25];
  let hasAlpha = colorType === 4 || colorType === 6;
  if (colorType === 3) {
    // palette images are transparent if they carry a tRNS chunk
    for (let p = 8; p + 8 <= buf.length;) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      if (type === 'tRNS') hasAlpha = true;
      if (type === 'IDAT') break;
      p += 12 + len;
    }
  }
  return { width: dv.getUint32(16), height: dv.getUint32(20), hasAlpha };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- these are parsed JSON config files */
export interface Inputs {
  appJson: any;
  packageJson: any;
  easJson: any | null;
  storeConfig: any | null;
  playListing: any | null;
  /** "required reason" API declarations shipped by the installed native packages (see privacy.ts); omit to skip */
  requiredPrivacy?: Reasons;
  /** read a file relative to the project root, or null if it doesn't exist */
  readFile: (rel: string) => Uint8Array | null;
}

const PLACEHOLDER_ID = /^(com\.example|com\.anonymous|host\.exp|com\.expo)(\.|$)/i;
const IOS_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ANDROID_ID = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Every string anywhere in a value that is still a "TODO" placeholder, with its path. */
function todos(v: unknown, at = ''): string[] {
  if (typeof v === 'string') return /^\s*TODO\b/.test(v) ? [at] : [];
  if (Array.isArray(v)) return v.flatMap((x, i) => todos(x, `${at}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => todos(x, at ? `${at}.${k}` : k));
  return [];
}

export function checkStoreReadiness(i: Inputs): Finding[] {
  const out: Finding[] = [];
  const err = (id: string, message: string) => out.push({ level: 'error', id, message });
  const warn = (id: string, message: string) => out.push({ level: 'warn', id, message });
  const expo = i.appJson?.expo ?? {};
  const png = (rel: string | undefined) => {
    if (!rel) return null;
    const b = i.readFile(rel.replace(/^\.\//, ''));
    return b ? pngInfo(b) : null;
  };

  // --- identity ---
  const iosId: string | undefined = expo.ios?.bundleIdentifier;
  const androidId: string | undefined = expo.android?.package;
  if (!iosId)
    err(
      'ios-bundle-id',
      'ios.bundleIdentifier is not set. Choose a permanent reverse-domain ID, e.g. com.yourname.goflashcards.',
    );
  else if (!IOS_ID.test(iosId)) err('ios-bundle-id', `ios.bundleIdentifier "${iosId}" is not a valid bundle ID.`);
  else if (PLACEHOLDER_ID.test(iosId))
    err('ios-bundle-id', `ios.bundleIdentifier "${iosId}" is a placeholder prefix; use one you own.`);
  if (!androidId)
    err('android-package', 'android.package is not set. Use the same reverse-domain ID as iOS where possible.');
  else if (!ANDROID_ID.test(androidId))
    err(
      'android-package',
      `android.package "${androidId}" is not valid (segments start with a letter; letters, digits, underscore).`,
    );
  else if (PLACEHOLDER_ID.test(androidId))
    err('android-package', `android.package "${androidId}" is a placeholder prefix; use one you own.`);

  if (!expo.name || String(expo.name).length > 30)
    err('name', 'expo.name must be 1-30 characters (the App Store title limit).');
  if (!SEMVER.test(expo.version ?? '')) err('version', `expo.version "${expo.version}" must look like 1.0.0.`);

  // --- icons and splash ---
  const icon = png(expo.icon);
  if (!icon) err('icon', 'expo.icon is missing or not a PNG.');
  else {
    if (icon.width !== 1024 || icon.height !== 1024)
      err('icon', `The app icon must be 1024x1024 (it is ${icon.width}x${icon.height}).`);
    if (icon.hasAlpha)
      err('icon', 'The app icon must not have an alpha channel or transparency: the App Store rejects it.');
  }
  const fg = png(expo.android?.adaptiveIcon?.foregroundImage);
  if (!fg) err('adaptive-icon', 'android.adaptiveIcon.foregroundImage is missing or not a PNG.');
  else if (fg.width !== fg.height || fg.width < 432)
    err('adaptive-icon', 'The adaptive icon foreground must be square and at least 432px.');
  if (!expo.android?.adaptiveIcon?.backgroundColor && !expo.android?.adaptiveIcon?.backgroundImage)
    err('adaptive-icon', 'The adaptive icon needs a backgroundColor or backgroundImage.');
  if (!png(expo.android?.adaptiveIcon?.monochromeImage))
    warn('monochrome-icon', 'No monochrome icon: Android 13+ themed icons will fall back to a generic shape.');
  const plugins: unknown[] = expo.plugins ?? [];
  const splash = plugins.find((p) => p === 'expo-splash-screen' || (Array.isArray(p) && p[0] === 'expo-splash-screen'));
  const splashImage = Array.isArray(splash) ? splash[1]?.image : undefined;
  if (!splash) err('splash', 'expo-splash-screen is not configured.');
  else if (!splashImage || !png(splashImage)) err('splash', 'The splash screen image is missing.');

  // --- permissions and declarations ---
  const audio = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-audio') as
    [string, Record<string, unknown>] | undefined;
  if (plugins.includes('expo-audio') || audio) {
    const o = audio?.[1] ?? {};
    if (o.microphonePermission !== false)
      err(
        'audio-microphone',
        'expo-audio declares microphone access by default; set microphonePermission to false (the app only plays sounds).',
      );
    if (o.recordAudioAndroid !== false)
      err('audio-record', 'expo-audio adds RECORD_AUDIO on Android by default; set recordAudioAndroid to false.');
    if (o.enableBackgroundPlayback !== false)
      err(
        'audio-background',
        'expo-audio enables background audio by default (an iOS background mode a reviewer will question); set enableBackgroundPlayback to false.',
      );
    const deps = { ...i.packageJson?.dependencies };
    if (!deps['expo-asset'])
      err(
        'expo-asset',
        'expo-audio needs expo-asset as a peer dependency; without it a store build can crash. Run: npx expo install expo-asset',
      );
  }
  const blocked: string[] = expo.android?.blockedPermissions ?? [];
  for (const p of ['android.permission.RECORD_AUDIO'])
    if (!blocked.includes(p)) err('blocked-permissions', `android.blockedPermissions should include ${p}.`);
  if (expo.ios?.config?.usesNonExemptEncryption !== false)
    err(
      'encryption',
      'Set ios.config.usesNonExemptEncryption to false (the app uses no non-exempt encryption) so every build skips the export-compliance question.',
    );
  if (expo.ios?.supportsTablet && expo.orientation === 'portrait' && !expo.ios?.requireFullScreen)
    err(
      'ipad-orientation',
      'An iPad app locked to portrait must set ios.requireFullScreen to true, or App Store Connect rejects the build.',
    );

  // --- Apple privacy manifest ---
  if (i.requiredPrivacy) {
    const missing = missingReasons(i.requiredPrivacy, declaredReasons(i.appJson));
    if (missing.length)
      err(
        'privacy-manifest',
        `app.json ios.privacyManifests is missing reasons that installed native packages declare (${missing.join(', ')}). Apple does not reliably read manifests inside static pods. Run: npm run privacy:sync`,
      );
  }

  // --- legal ---
  const license = i.readFile('LICENSE');
  if (license && new TextDecoder().decode(license).includes('650 Industries'))
    err(
      'license',
      "LICENSE is still Expo's template (copyright 650 Industries). Replace it with your own license or copyright notice.",
    );

  // --- build config ---
  if (!i.easJson) err('eas-json', 'eas.json is missing.');
  else {
    if (!i.easJson.build?.production) err('eas-production', 'eas.json has no "production" build profile.');
    if (i.easJson.cli?.appVersionSource !== 'remote')
      warn('eas-version-source', 'Set cli.appVersionSource to "remote" so build numbers are managed for you.');
    if (i.easJson.build?.production?.autoIncrement !== true)
      warn('eas-autoincrement', 'Set build.production.autoIncrement to true; the stores reject a reused build number.');
  }

  // --- listing: Apple ---
  const apple = i.storeConfig?.apple;
  if (!apple) err('store-config', 'store.config.json (Apple listing) is missing.');
  else {
    const info = apple.info?.['en-US'] ?? {};
    const len = (v: unknown) => (typeof v === 'string' ? v.length : 0);
    if (len(info.title) < 2 || len(info.title) > 30) err('apple-title', 'Apple title must be 2-30 characters.');
    if (len(info.subtitle) > 30)
      err('apple-subtitle', `Apple subtitle is ${len(info.subtitle)} characters; the limit is 30.`);
    if (len(info.description) < 10 || len(info.description) > 4000)
      err('apple-description', 'Apple description must be 10-4000 characters.');
    if (len(info.promoText) > 170) err('apple-promo', 'Apple promotional text is limited to 170 characters.');
    const kw = (info.keywords ?? []).join(',');
    if (!kw) warn('apple-keywords', 'No Apple keywords set.');
    if (kw.length > 100)
      err('apple-keywords', `Apple keywords total ${kw.length} characters (commas included); the limit is 100.`);
    if (len(info.releaseNotes) > 4000) err('apple-release-notes', 'Release notes are limited to 4000 characters.');
    const notes = apple.review?.notes;
    if (typeof notes !== 'string' || notes.length < 2 || notes.length > 4000)
      err('apple-review-notes', 'Review notes must be 2-4000 characters.');
    if (!apple.categories?.length) err('apple-categories', 'No App Store category chosen.');
    if (!apple.advisory) err('apple-advisory', 'The age-rating questionnaire (advisory) is missing.');
  }
  if (i.storeConfig) {
    const t = todos(i.storeConfig);
    if (t.length) err('store-todo', `store.config.json still has TODO placeholders to fill in: ${t.join(', ')}`);
  }

  // --- listing: Google Play ---
  const play = i.playListing;
  if (!play) err('play-listing', 'store/play-listing.json is missing.');
  else {
    if (!play.title || play.title.length > 30) err('play-title', 'Play title must be 1-30 characters.');
    if (!play.shortDescription || play.shortDescription.length > 80)
      err(
        'play-short',
        `Play short description must be 1-80 characters (it is ${play.shortDescription?.length ?? 0}).`,
      );
    if (!play.fullDescription || play.fullDescription.length > 4000)
      err('play-full', 'Play full description must be 1-4000 characters.');
  }
  const playIcon = png('store/assets/play-icon-512.png');
  if (!playIcon || playIcon.width !== 512 || playIcon.height !== 512)
    err('play-icon', 'store/assets/play-icon-512.png must be a 512x512 PNG (run npm run assets:icons).');
  const feature = png('store/assets/feature-graphic-1024x500.png');
  if (!feature || feature.width !== 1024 || feature.height !== 500)
    err('play-feature', 'store/assets/feature-graphic-1024x500.png must be a 1024x500 PNG (run npm run assets:icons).');

  return out;
}

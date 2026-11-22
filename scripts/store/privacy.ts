/**
 * Collect the Apple "required reason" API declarations that the installed native packages ship in their own
 * PrivacyInfo.xcprivacy files. Apple doesn't reliably read manifests inside static CocoaPods, so the app's own
 * manifest (ios.privacyManifests in app.json) should declare the same reasons. See
 * https://docs.expo.dev/guides/apple-privacy/
 */
import fs from 'node:fs';
import path from 'node:path';

export type Reasons = Record<string, string[]>;

/** Parse the NSPrivacyAccessedAPITypes entries out of a PrivacyInfo.xcprivacy (an XML plist). */
export function parsePrivacyInfo(xml: string): Reasons {
  const out: Reasons = {};
  const block =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (const m of xml.matchAll(block)) {
    const reasons = [...m[2].matchAll(/<string>([^<]+)<\/string>/g)].map((r) => r[1].trim());
    out[m[1].trim()] = [...new Set([...(out[m[1].trim()] ?? []), ...reasons])];
  }
  return out;
}

/** Merge several declarations into one, de-duplicated and sorted. */
export function unionReasons(all: Reasons[]): Reasons {
  const out: Record<string, Set<string>> = {};
  for (const r of all)
    for (const [type, reasons] of Object.entries(r)) for (const x of reasons) (out[type] ??= new Set()).add(x);
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((t) => [t, [...out[t]].sort()]),
  );
}

/** Reasons the app's config declares (ios.privacyManifests.NSPrivacyAccessedAPITypes). */
export function declaredReasons(appJson: {
  expo?: { ios?: { privacyManifests?: { NSPrivacyAccessedAPITypes?: unknown } } };
}): Reasons {
  const out: Reasons = {};
  const list = appJson?.expo?.ios?.privacyManifests?.NSPrivacyAccessedAPITypes;
  if (Array.isArray(list))
    for (const e of list as { NSPrivacyAccessedAPIType?: string; NSPrivacyAccessedAPITypeReasons?: string[] }[])
      if (e?.NSPrivacyAccessedAPIType) out[e.NSPrivacyAccessedAPIType] = e.NSPrivacyAccessedAPITypeReasons ?? [];
  return out;
}

/** Reasons that are required but not declared, as "Type: reason" strings. */
export function missingReasons(required: Reasons, declared: Reasons): string[] {
  const out: string[] = [];
  for (const [type, reasons] of Object.entries(required))
    for (const r of reasons) if (!(declared[type] ?? []).includes(r)) out.push(`${type}: ${r}`);
  return out;
}

/** The `NSPrivacyAccessedAPITypes` array form used in app.json. */
export const toAppJson = (r: Reasons) =>
  Object.entries(r).map(([type, reasons]) => ({
    NSPrivacyAccessedAPIType: type,
    NSPrivacyAccessedAPITypeReasons: reasons,
  }));

/** Every PrivacyInfo.xcprivacy under node_modules (not inside generated Pods), unioned. */
export function collectInstalledReasons(root = process.cwd()): { reasons: Reasons; files: string[] } {
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'Pods' && e.name !== '.bin' && e.name !== 'android') walk(p, depth + 1);
      else if (e.isFile() && e.name.toLowerCase() === 'privacyinfo.xcprivacy') files.push(p);
    }
  };
  walk(path.join(root, 'node_modules'), 0);
  const reasons = unionReasons(files.map((f) => parsePrivacyInfo(fs.readFileSync(f, 'utf8'))));
  return { reasons, files: files.map((f) => path.relative(root, f).replace(/\\/g, '/')) };
}

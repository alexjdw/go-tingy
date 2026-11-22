import fs from 'node:fs';
import path from 'node:path';
import { type Dep, licenseOf } from './licenses';

/** The npm packages whose code is in a bundle, from the `sources` of its source map (sorted, no duplicates). */
export function packagesInSources(sources: string[]): string[] {
  const names = new Set<string>();
  for (const s of sources) {
    const parts = s.split(/[\\/]/);
    const i = parts.lastIndexOf('node_modules');
    if (i < 0 || i + 1 >= parts.length) continue;
    const first = parts[i + 1];
    const name = first.startsWith('@') ? parts.slice(i + 1, i + 3).join('/') : first;
    if (name && !name.startsWith('.')) names.add(name);
  }
  return [...names].sort();
}

/** Read license details for installed packages by name (the copy that resolves from the project root). */
export function depsForNames(names: string[], root = process.cwd()): Dep[] {
  const out: Dep[] = [];
  for (const name of names) {
    const dir = path.join(root, 'node_modules', name);
    let pkg: { name?: string; version?: string; license?: unknown; licenses?: unknown };
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const file = fs.readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)(\.(md|txt))?$/i.test(f));
    out.push({
      name,
      version: pkg.version ?? '',
      license: licenseOf(pkg),
      text: file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : '',
    });
  }
  return out;
}

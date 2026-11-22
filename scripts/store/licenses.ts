/**
 * Audit of the licenses of everything that ships in the app (the production dependency tree, from
 * package-lock.json). Pure helpers are tested; `npm run licenses` prints the audit and writes
 * THIRD_PARTY_NOTICES.md.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Dep {
  name: string;
  version: string;
  /** SPDX-style license expression, or "UNKNOWN" */
  license: string;
  /** full text of the package's license file, if it has one */
  text: string;
}

/** Licenses that allow shipping the code in a closed-source app, as long as the notice is kept. */
export const PERMISSIVE = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD',
  'Apache-2.0',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
  'Zlib',
  'Python-2.0',
  'CC-BY-4.0',
  'WTFPL',
]);

/** Licenses that would force the app (or part of it) to be released under the same terms. */
export const COPYLEFT = /\b(A?GPL|LGPL|MPL|EPL|CDDL|OSL|EUPL|SSPL|CPAL|RPL)\b/i;

/** Normalize the `license` / `licenses` fields of a package.json into one expression string. */
export function licenseOf(pkg: { license?: unknown; licenses?: unknown }): string {
  const one = (v: unknown): string | null =>
    typeof v === 'string'
      ? v
      : v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string'
        ? (v as { type: string }).type
        : null;
  const direct = one(pkg.license);
  if (direct) return direct;
  if (Array.isArray(pkg.licenses)) {
    const all = pkg.licenses.map(one).filter((x): x is string => !!x);
    if (all.length) return all.length === 1 ? all[0] : `(${all.join(' OR ')})`;
  }
  return 'UNKNOWN';
}

/**
 * Can this license be used in a closed-source app? An "A OR B" expression only needs one acceptable choice; an
 * "A AND B" expression needs both.
 */
export function isAcceptable(expr: string): boolean {
  const e = expr.trim().replace(/^\(|\)$/g, '');
  if (/\sOR\s/i.test(e)) return e.split(/\sOR\s/i).some((p) => isAcceptable(p));
  if (/\sAND\s/i.test(e)) return e.split(/\sAND\s/i).every((p) => isAcceptable(p));
  const id = e.replace(/\+$/, '').trim();
  return PERMISSIVE.has(id) && !COPYLEFT.test(id);
}

/** The packages that go into the production app: everything in the lockfile not marked dev-only. */
export function productionDeps(root = process.cwd()): Dep[] {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const out: Dep[] = [];
  for (const [p, info] of Object.entries<{ dev?: boolean; devOptional?: boolean; version?: string; link?: boolean }>(
    lock.packages ?? {},
  )) {
    if (!p.startsWith('node_modules/') || info.dev || info.devOptional || info.link) continue;
    const dir = path.join(root, p);
    let pkg: { name?: string; version?: string; license?: unknown; licenses?: unknown };
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue; // an optional platform package that isn't installed here
    }
    const file = fs.readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)(\.(md|txt))?$/i.test(f));
    out.push({
      name: pkg.name ?? p.replace(/^.*node_modules\//, ''),
      version: pkg.version ?? info.version ?? '',
      license: licenseOf(pkg),
      text: file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : '',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Group packages that share identical license text, so each text is printed once. */
export function renderNotices(deps: Dep[]): string {
  const groups = new Map<string, Dep[]>();
  for (const d of deps) {
    const key = d.text ? d.text.replace(/\s+/g, ' ') : `(no license file) ${d.license}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const lines = [
    '# Third-party notices',
    '',
    'Go Flashcards includes the open-source software below. Each component is licensed by its own authors under the',
    'terms shown; those terms apply to that component only and not to the rest of this app.',
    '',
  ];
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) {
    lines.push(`## ${[...new Set(g.map((d) => d.license))].join(', ')}`, '');
    lines.push(g.map((d) => `${d.name}@${d.version}`).join(', '), '');
    lines.push(
      g[0].text ? '```text\n' + g[0].text + '\n```' : '_No license text was shipped with these packages._',
      '',
    );
  }
  return lines.join('\n');
}

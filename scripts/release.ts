/**
 * `npm run release -- v1.0.0 name=path-or-url ...`: publish builds to the GitHub Releases page by hand (no CI).
 *
 * Build in the cloud with EAS, then upload the results, e.g.
 *   GITHUB_TOKEN=... npm run release -- v1.0.0 \
 *     go-flashcards-1.0.0-android.apk=https://expo.dev/artifacts/eas/....apk \
 *     go-flashcards-1.0.0-ios-simulator.tar.gz=https://expo.dev/artifacts/eas/....tar.gz
 * Each asset is `name=file or https URL`. The token needs write access to this repository's contents (a
 * fine-grained token with "Contents: read and write", or a classic token with the `repo` scope).
 * The release is created if the tag has none, and an asset with the same name is replaced.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

export interface Asset {
  name: string;
  source: string;
}

/** `owner/repo` from a GitHub remote URL (https or ssh), or null. */
export function parseRepo(remote: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/.exec(remote.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** `name=source` -> an asset; the name may not contain a slash. */
export function parseAsset(arg: string): Asset | null {
  const i = arg.indexOf('=');
  if (i <= 0 || i === arg.length - 1) return null;
  const name = arg.slice(0, i);
  return name.includes('/') || name.includes('\\') ? null : { name, source: arg.slice(i + 1) };
}

async function main() {
  const [tag, ...rest] = process.argv.slice(2);
  const token = process.env.GITHUB_TOKEN;
  const repo = parseRepo(execSync('git remote get-url origin', { encoding: 'utf8' }));
  const assets = rest.map((a) => ({ arg: a, asset: parseAsset(a) }));
  const bad = assets.find((a) => !a.asset);
  if (!tag || !/^v?\d/.test(tag) || !repo || !token || bad) {
    console.error(
      bad
        ? `Not name=path-or-url: ${bad.arg}`
        : !token
          ? 'Set GITHUB_TOKEN (see the comment at the top of scripts/release.ts).'
          : 'Usage: npm run release -- v1.0.0 name=path-or-url ...',
    );
    process.exit(1);
  }
  const api = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const call = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    if (!r.ok && r.status !== 404) throw new Error(`${init.method ?? 'GET'} ${url}: ${r.status} ${await r.text()}`);
    return r;
  };

  let res = await call(`${api}/releases/tags/${tag}`);
  if (res.status === 404) {
    res = await call(`${api}/releases`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tag, name: `Go Flashcards ${tag}`, generate_release_notes: true }),
    });
    console.log(`created release ${tag}`);
  }
  const release = (await res.json()) as { id: number; html_url: string; assets: { id: number; name: string }[] };

  for (const { asset } of assets) {
    const { name, source } = asset!;
    let data: Buffer;
    if (/^https?:\/\//.test(source)) {
      const r = await fetch(source);
      if (!r.ok) throw new Error(`could not download ${source}: ${r.status}`);
      data = Buffer.from(await r.arrayBuffer());
    } else data = fs.readFileSync(source);
    const old = release.assets.find((a) => a.name === name);
    if (old) await call(`${api}/releases/assets/${old.id}`, { method: 'DELETE' });
    await call(
      `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(data),
      },
    );
    console.log(`uploaded ${name} (${(data.length / 1e6).toFixed(1)} MB)`);
  }
  console.log(release.html_url);
}

if (/scripts[\\/]release\.ts$/.test(process.argv[1] ?? '')) void main();

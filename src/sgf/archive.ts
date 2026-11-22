import { gunzipSync, unzipSync } from 'fflate';

export interface RawFile {
  name: string;
  bytes: Uint8Array;
}

/** Upper bound on decompressed data per file/archive, to refuse zip bombs. */
export const MAX_BYTES = 64 * 1024 * 1024;

const isGzip = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b;
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);

/** Name without directories or extensions like .sgf / .sgf.gz / .zip, for use as a collection name. */
export const baseName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? name).replace(/\.gz$/i, '').replace(/\.(sgf|txt|zip|ugf)$/i, '');

/**
 * Expand a picked file into the SGF files inside it. Detects by magic bytes, not extension:
 * gzip (.sgf.gz) and zip are unpacked; anything else is returned as is.
 */
export function expandFile(name: string, bytes: Uint8Array, depth = 0): RawFile[] {
  if (depth > 2) throw new Error('Archive is nested too deeply');
  if (isGzip(bytes)) {
    // The last 4 bytes of a gzip stream hold the uncompressed size (mod 2^32).
    const n = bytes.length;
    const size = n >= 4 ? (bytes[n - 4] | (bytes[n - 3] << 8) | (bytes[n - 2] << 16) | (bytes[n - 1] << 24)) >>> 0 : 0;
    if (size > MAX_BYTES) throw new Error('Compressed file expands to more than 64 MB');
    return expandFile(name.replace(/\.gz$/i, ''), gunzipSync(bytes), depth + 1);
  }
  if (isZip(bytes)) {
    let total = 0;
    const entries = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false;
        if (!/\.(sgf|txt|gz)$/i.test(f.name)) return false;
        total += f.originalSize;
        return f.originalSize <= MAX_BYTES && total <= MAX_BYTES;
      },
    });
    const names = Object.keys(entries).sort();
    if (!names.length) throw new Error('No .sgf files found in the archive');
    return names.flatMap((n) => expandFile(n, entries[n], depth + 1));
  }
  return [{ name, bytes }];
}

/**
 * Decode SGF bytes with encoding detection.
 *
 * Order: BOM -> valid UTF-8 -> the file's own CA[...] declaration -> statistical detection among common
 * Go-record encodings (GBK, Big5, Shift_JIS, EUC-KR, EUC-JP) -> Windows-1252.
 *
 * Browsers decode every encoding natively; Hermes (React Native) only does UTF-8, so other encodings fall
 * back to a lazily loaded pure-JS decoder.
 */

export interface Decoded {
  text: string;
  /** Display name, e.g. "UTF-8", "gbk" */
  encoding: string;
  how: 'bom' | 'utf8' | 'declared' | 'detected' | 'fallback';
}

interface Dec {
  decode(b: Uint8Array): string;
}

let poly: any = null;
function polyfill() {
  if (!poly) {
    require('@zxing/text-encoding/cjs/encoding-indexes'); // registers the lookup tables globally
    poly = require('@zxing/text-encoding');
  }
  return poly;
}

function makeDecoder(label: string, fatal: boolean): Dec | null {
  try {
    return new TextDecoder(label, { fatal });
  } catch {
    /* unsupported natively (e.g. Hermes) */
  }
  try {
    return new (polyfill().TextDecoder)(label, { fatal });
  } catch {
    return null;
  }
}

const tryDecode = (bytes: Uint8Array, label: string): string | null => {
  const d = makeDecoder(label, true);
  if (!d) return null;
  try {
    return d.decode(bytes);
  } catch {
    return null; // invalid byte sequence for this encoding
  }
};

const ALIASES: Record<string, string> = {
  utf8: 'utf-8',
  gb2312: 'gbk',
  gb_2312: 'gbk',
  'gb2312-80': 'gbk',
  sjis: 'shift_jis',
  'shift-jis': 'shift_jis',
  ms932: 'shift_jis',
  cp932: 'shift_jis',
  windows31j: 'shift_jis',
  euckr: 'euc-kr',
  'ks_c_5601-1987': 'euc-kr',
  eucjp: 'euc-jp',
  'big-5': 'big5',
  'big5-hkscs': 'big5',
  latin1: 'windows-1252',
  'iso-8859-1': 'windows-1252',
  ascii: 'windows-1252',
  'us-ascii': 'windows-1252',
};

export const normalizeLabel = (raw: string) => {
  const l = raw.trim().toLowerCase();
  return ALIASES[l] ?? l;
};

/** First CA[...] value in the first 64 KB (read as latin1; SGF property names are ASCII). */
function declaredCharset(bytes: Uint8Array): string | null {
  let s = '';
  const n = Math.min(bytes.length, 65536);
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
  const m = /(?:^|[;\])\s])CA\s*\[([^\]]*)\]/.exec(s);
  return m ? m[1] : null;
}

// Very common characters per language. Mis-decoded text is effectively random, so hits are strong evidence.
const ZH_SHARED = '黑白先活死劫提吃打的是不了人我在有他大中上下手子国这个地年生到出会可也你对能成多方';
const ZH_SIMPLIFIED = '这个们为时说后应对变价气点边关业东书买华头发开长门问间让还当么没过动';
const ZH_TRADITIONAL = '這個們為時說後應對變價氣點邊關業東書買華頭發開長門問間讓還當麼沒過動';
const KO_COMMON = '이다는의에을가고지한글국기사하리자인어대그수도나로시서일제정아부전것년상오금바마공은를과와';

/** Heuristic plausibility of `text` having been decoded with `label`. Higher is better. */
function plausibility(text: string, label: string): number {
  let good = 0;
  let bad = 0;
  let kana = 0;
  let hangul = 0;
  let hits = 0;
  const zh = label === 'gbk' ? ZH_SIMPLIFIED : label === 'big5' ? ZH_TRADITIONAL : '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) continue;
    if (c >= 0x3040 && c <= 0x30ff) {
      kana++;
      good++;
    } else if (c >= 0xac00 && c <= 0xd7af) {
      hangul++;
      good++;
      if (label === 'euc-kr' && KO_COMMON.includes(ch)) hits++;
    } else if ((c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff)) {
      bad++; // rare extension / compatibility ideographs: typical of a wrong guess
    } else if (c >= 0x4e00 && c <= 0x9fff) {
      good++;
      if ((zh && (zh.includes(ch) || ZH_SHARED.includes(ch))) || (!zh && label !== 'euc-kr' && ZH_SHARED.includes(ch))) hits++;
    } else if ((c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0x2000 && c <= 0x206f)) {
      good += 0.5; // CJK / fullwidth punctuation
    } else if ((c >= 0xff61 && c <= 0xff9f) || (c >= 0xe000 && c <= 0xf8ff) || c === 0xfffd || c < 0xa0) {
      bad++; // half-width katakana, private use, replacement, C1 controls: classic mojibake
    }
  }
  let score = good + hits * 2 - bad * 5;
  if (label === 'shift_jis' || label === 'euc-jp') score += kana; // kana is strong evidence for Japanese
  if (label === 'euc-kr' && hangul === 0) score *= 0.3;
  if ((label === 'shift_jis' || label === 'euc-jp') && kana === 0) score *= 0.7;
  return score;
}

// Order is the tie-break: GBK first (most common in Go records).
const CANDIDATES = ['gbk', 'shift_jis', 'big5', 'euc-kr', 'euc-jp'];

export function decodeSgfBytes(bytes: Uint8Array): Decoded {
  // 1. BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: makeDecoder('utf-8', false)!.decode(bytes.subarray(3)), encoding: 'UTF-8', how: 'bom' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    const d = makeDecoder('utf-16le', false);
    if (d) return { text: d.decode(bytes.subarray(2)), encoding: 'UTF-16LE', how: 'bom' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const d = makeDecoder('utf-16be', false);
    if (d) return { text: d.decode(bytes.subarray(2)), encoding: 'UTF-16BE', how: 'bom' };
  }

  // 2. Valid UTF-8 (pure ASCII included). Non-ASCII that validates as UTF-8 almost certainly is UTF-8.
  const utf8 = tryDecode(bytes, 'utf-8');
  if (utf8 !== null) return { text: utf8, encoding: 'UTF-8', how: 'utf8' };

  // 3. Declared charset
  const declared = declaredCharset(bytes);
  if (declared) {
    const label = normalizeLabel(declared);
    const text = tryDecode(bytes, label);
    if (text !== null) return finish(text, label, 'declared');
  }

  // 4. Detection
  let best: { label: string; text: string; score: number } | null = null;
  for (const label of CANDIDATES) {
    const text = tryDecode(bytes, label);
    if (text === null) continue;
    const score = plausibility(text, label);
    if (!best || score > best.score) best = { label, text, score };
  }
  // A lone accented Latin-1 letter can pair with the next byte into a valid CJK character, so require
  // more than a single character's worth of evidence before trusting a CJK guess.
  if (best && best.score >= 3) return finish(best.text, best.label, 'detected');

  // 5. Last resort: Western single-byte
  const text = makeDecoder('windows-1252', false)?.decode(bytes) ?? '';
  return finish(text, 'windows-1252', 'fallback');
}

/** The decoded text is now Unicode: make any CA[...] declaration say so. */
function finish(text: string, label: string, how: Decoded['how']): Decoded {
  return {
    text: text.replace(/([;\])\s])CA\s*\[[^\]]*\]/g, '$1CA[UTF-8]'),
    encoding: label,
    how,
  };
}

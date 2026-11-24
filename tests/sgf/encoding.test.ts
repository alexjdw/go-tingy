import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeSgfBytes } from '../../src/sgf/encoding';

describe('SGF text encoding', () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const bytes = (...parts: (string | number[])[]) =>
    Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? ascii(p) : p)));
  const SJIS = [
    0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x82, 0xcc, 0x83, 0x52, 0x83, 0x81, 0x83, 0x93, 0x83, 0x67, 0x82, 0xc5, 0x82,
    0xb7,
  ]; // 日本語のコメントです
  const GBK = [0xba, 0xda, 0xcf, 0xc8, 0xd5, 0xe2, 0xb8, 0xf6, 0xbb, 0xee]; // 黑先这个活
  const KR = [0xc7, 0xd1, 0xb1, 0xdb, 0xc7, 0xd1, 0xb1, 0xdb]; // 한글한글

  it('detects UTF-8, BOMs, UTF-16, declared and undeclared CJK encodings, and falls back to windows-1252', () => {
    // encoding detection
    let r = decodeSgfBytes(new TextEncoder().encode('(;C[黑先活 日本語 한글];B[aa])'));
    assert.deepEqual([r.encoding, r.how], ['UTF-8', 'utf8']);
    r = decodeSgfBytes(bytes([0xef, 0xbb, 0xbf], '(;C[', [0xe4, 0xb8, 0xad], '])'));
    assert.deepEqual([r.how, r.text], ['bom', '(;C[中])']);
    r = decodeSgfBytes(bytes([0xff, 0xfe], [0x28, 0, 0x3b, 0, 0x43, 0, 0x5b, 0, 0x2d, 0x4e, 0x5d, 0, 0x29, 0]));
    assert.deepEqual([r.encoding, r.text], ['UTF-16LE', '(;C[中])']);
    r = decodeSgfBytes(bytes('(;GM[1]CA[GB2312]C[', GBK, '];B[aa])'));
    assert.deepEqual([r.encoding, r.how], ['gbk', 'declared']);
    assert.ok(r.text.includes('黑先这个活') && r.text.includes('CA[UTF-8]'));
    r = decodeSgfBytes(bytes('(;CA[SJIS]C[', SJIS, '];B[aa])'));
    assert.deepEqual([r.encoding, r.how], ['shift_jis', 'declared']);
    r = decodeSgfBytes(bytes('(;CA[UTF-8]C[', SJIS, '];B[aa])')); // mislabelled: falls through to detection
    assert.equal(r.how, 'detected');
    assert.ok(r.text.includes('日本語のコメントです'));
    r = decodeSgfBytes(bytes('(;C[', SJIS, '];B[aa])'));
    assert.deepEqual([r.encoding, r.how], ['shift_jis', 'detected']);
    assert.ok(r.text.includes('日本語のコメントです'));
    r = decodeSgfBytes(bytes('(;C[', GBK, '];B[aa])'));
    assert.deepEqual([r.encoding, r.how], ['gbk', 'detected']);
    assert.ok(r.text.includes('黑先这个活'));
    r = decodeSgfBytes(bytes('(;C[', KR, '];B[aa])'));
    assert.equal(r.encoding, 'euc-kr');
    r = decodeSgfBytes(bytes('(;C[caf', [0xe9], '];B[aa])'));
    assert.deepEqual([r.encoding, r.how], ['windows-1252', 'fallback']);
    assert.ok(r.text.includes('café'));
  });

  it('falls back to the pure-JS decoder where TextDecoder only handles UTF-8 (Hermes)', () => {
    // platforms whose TextDecoder only handles UTF-8 (Hermes): fall back to the pure-JS decoder
    const nativeTD = globalThis.TextDecoder;
    const g = globalThis as unknown as { TextDecoder: unknown };
    g.TextDecoder = class {
      private d: TextDecoder;
      constructor(l: string, o?: TextDecoderOptions) {
        if (!/^utf-?8$/i.test(l)) throw new RangeError(l);
        this.d = new nativeTD('utf-8', o);
      }
      decode(x: Uint8Array) {
        return this.d.decode(x);
      }
    };
    let r: ReturnType<typeof decodeSgfBytes>;
    try {
      r = decodeSgfBytes(bytes('(;CA[GBK]C[', GBK, '];B[aa])'));
    } finally {
      g.TextDecoder = nativeTD;
    }
    assert.ok(r.text.includes('黑先这个活'), 'polyfill path');
  });
});

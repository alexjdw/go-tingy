import assert from 'node:assert/strict';
import { StudyEngine } from '../src/study/engine';
import { Board } from '../src/go/board';
import { SAMPLES } from '../src/data/samples';
import { computeSkill, Attempt } from '../src/progress/skill';
import { parseSgf, toSgf, flipColors, splitCollection } from '../src/sgf/parser';
import { validateSgf } from '../src/sgf/validate';
import { decodeSgfBytes } from '../src/sgf/encoding';
import { prepareSgf } from '../src/sgf/normalize';
import { expandFile, baseName } from '../src/sgf/archive';
import { gzipSync, zipSync, strToU8 } from 'fflate';
import { test } from 'node:test';

test('core: engine, board, parser, validation, encoding, archives, skill', () => {

  // capture
  const e = new StudyEngine(SAMPLES[0].sgf, 'unguided');
  assert.equal(e.play({ x: 5, y: 5 }), 'wrong');
  assert.equal(e.mistakes, 1);
  assert.equal(e.play({ x: 0, y: 2 }), 'solved');
  assert.equal(e.snap.board.get({ x: 0, y: 1 }), null, 'stone captured');
  assert.equal(e.attempt(1000).correct, false);

  // two-stone capture
  const e2 = new StudyEngine(SAMPLES[1].sgf, 'unguided');
  assert.equal(e2.play({ x: 0, y: 3 }), 'solved');

  // joseki: learner is W, opponent replies from book
  const j = new StudyEngine(SAMPLES[2].sgf, 'guided', { rng: () => 0 });
  assert.equal(j.playerColor, 'W');
  assert.equal(j.play({ x: 2, y: 2 }), 'ok');
  assert.equal(j.snap.toPlay, 'W');
  assert.equal(j.bookMoves().length, 2);
  j.undo();
  assert.equal(j.snap.node, j.root);

  // explore leaves book
  const x = new StudyEngine(SAMPLES[2].sgf, 'explore');
  x.play({ x: 2, y: 2 });
  x.play({ x: 10, y: 10 });
  assert.equal(x.snap.node, null);

  // suicide / capture-beats-suicide
  const b = new Board(5).withStone({ x: 1, y: 0 }, 'B').withStone({ x: 0, y: 1 }, 'B');
  assert.equal(b.play({ x: 0, y: 0 }, 'W'), null, 'suicide illegal');
  const c = new Board(5).withStone({ x: 1, y: 0 }, 'B').withStone({ x: 0, y: 1 }, 'W').withStone({ x: 1, y: 1 }, 'B');
  assert.ok(c.play({ x: 0, y: 0 }, 'B'));

  // serialization round trip
  for (const s of SAMPLES) {
    const once = toSgf(parseSgf(s.sgf));
    assert.equal(toSgf(parseSgf(once)), once);
  }
  assert.equal(toSgf(parseSgf('(;C[a\\]b\\\\c];B[aa])')), '(;C[a\\]b\\\\c];B[aa])');

  // colour flipping (incl. comment words)
  const f = parseSgf(SAMPLES[0].sgf);
  flipColors(f);
  assert.deepEqual(f.props.PL, ['W']);
  assert.deepEqual(f.props.AW, ['aa', 'bb']);
  assert.match(f.props.C[0], /White to play/);
  const fe = new StudyEngine(SAMPLES[0].sgf, 'unguided', { flipColors: 'on' });
  assert.equal(fe.playerColor, 'W');
  assert.equal(fe.play({ x: 0, y: 2 }), 'solved');
  assert.equal(new StudyEngine(SAMPLES[0].sgf, 'explore', { flipColors: 'on' }).playerColor, 'B', 'no flip in explore');

  // multiple choice (A/B/C labels): only lettered points tappable in unguided mode
  const mc = `(;SZ[19]PL[B]AB[aa]AW[ab]LB[cc:A][dd:B][ee:C]
    (;B[cc]TE[1])(;B[dd]BM[1])(;B[ee]BM[1]))`;
  const m1 = new StudyEngine(mc, 'unguided');
  assert.equal(m1.choicePoints().length, 3);
  assert.equal(m1.play({ x: 9, y: 9 }), 'illegal');
  assert.equal(m1.mistakes, 0, 'unlettered tap is ignored, not a mistake');
  assert.equal(m1.play({ x: 3, y: 3 }), 'wrong');
  assert.equal(m1.play({ x: 2, y: 2 }), 'solved');
  assert.equal(new StudyEngine(mc, 'guided').play({ x: 9, y: 9 }), 'wrong', 'guided is unrestricted');

  // mark-the-choices phase at the root
  const mk2 = `(;SZ[19]PL[B]AB[aa]AW[ab]
    (;B[cc]TE[1])(;B[dd];W[ee];B[ff]C[Correct])(;B[gg]BM[1])(;B[hh]C[hmm]))`;
  const k = new StudyEngine(mk2, 'unguided', { markChoices: 'on' });
  assert.equal(k.phase, 'mark');
  assert.equal(k.play({ x: 2, y: 2 }), 'illegal', 'cannot play during mark phase');
  k.toggleMark({ x: 2, y: 2 });
  assert.equal(k.submitMarks(), 'wrong', 'dd missing');
  k.toggleMark({ x: 3, y: 3 });
  k.toggleMark({ x: 6, y: 6 }); // gg is wrong
  assert.equal(k.submitMarks(), 'wrong');
  k.toggleMark({ x: 6, y: 6 });
  assert.equal(k.submitMarks(), 'ok');
  assert.equal(k.phase, 'play');
  assert.equal(k.mistakes, 2);
  assert.equal(k.play({ x: 2, y: 2 }), 'solved');
  assert.equal(new StudyEngine(mk2, 'unguided', { markChoices: 'off' }).phase, 'play');
  assert.equal(new StudyEngine(mk2, 'guided', { markChoices: 'on' }).phase, 'play', 'only unguided');
  assert.equal(new StudyEngine(SAMPLES[0].sgf, 'unguided', { markChoices: 'on' }).phase, 'play', 'no branch point');

  // replay up to a deeper branching point
  const deep = `(;SZ[19]PL[B]AB[aa]AW[ab]
    (;B[cc];W[dd](;B[ee]TE[1])(;B[ff]TE[1])(;B[gg]BM[1])))`;
  const d = new StudyEngine(deep, 'unguided', { markChoices: 'on' });
  assert.equal(d.phase, 'replay');
  d.replayStep();
  assert.equal(d.phase, 'replay');
  d.replayStep();
  assert.equal(d.phase, 'mark');
  assert.equal(d.snap.toPlay, 'B');
  d.toggleMark({ x: 4, y: 4 });
  d.toggleMark({ x: 5, y: 5 });
  assert.equal(d.submitMarks(), 'ok');
  assert.equal(d.play({ x: 4, y: 4 }), 'solved');

  // collections & validation
  assert.equal(splitCollection('junk (;B[aa]) (;W[bb](;B[cc])(;B[dd]))  ').length, 2);
  assert.equal(splitCollection('(;C[a)b(c];B[aa])').length, 1, 'parens inside values ignored');
  assert.equal(splitCollection('').length, 0);
  assert.equal(splitCollection('not sgf').length, 1);
  for (const sm of SAMPLES) assert.deepEqual(validateSgf(sm.sgf).errors, [], sm.title);
  assert.ok(validateSgf('not sgf').errors.length);
  assert.ok(validateSgf('(;SZ[19]AB[aa]AW[aa];B[bb])').errors[0].includes('overlap'));
  assert.ok(validateSgf('(;SZ[9];B[jj])').errors[0].includes('outside'));
  assert.ok(validateSgf('(;SZ[9];B[aa];W[aa])').errors[0].includes('Illegal'));
  assert.ok(validateSgf('(;SZ[9]AB[ba][ab];W[aa])').errors[0].includes('Illegal'), 'suicide');
  assert.ok(validateSgf('(;SZ[9]AB[aa])').errors[0].includes('no moves'));
  assert.ok(validateSgf('(;SZ[abc];B[aa])').errors[0].includes('board size'));
  assert.ok(validateSgf('(;SZ[9];B[aa])').warnings.some((w) => w.includes('marked')));
  assert.equal(validateSgf('(;SZ[9]GN[Hi];B[aa]TE[1])').title, 'Hi');

  // encoding detection
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const bytes = (...parts: (string | number[])[]) =>
    Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? ascii(p) : p)));
  const SJIS = [0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x82, 0xcc, 0x83, 0x52, 0x83, 0x81, 0x83, 0x93, 0x83, 0x67, 0x82, 0xc5, 0x82, 0xb7]; // 日本語のコメントです
  const GBK = [0xba, 0xda, 0xcf, 0xc8, 0xd5, 0xe2, 0xb8, 0xf6, 0xbb, 0xee]; // 黑先这个活
  const KR = [0xc7, 0xd1, 0xb1, 0xdb, 0xc7, 0xd1, 0xb1, 0xdb]; // 한글한글
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
  // platforms whose TextDecoder only handles UTF-8 (Hermes): fall back to the pure-JS decoder
  const nativeTD = globalThis.TextDecoder;
  (globalThis as any).TextDecoder = class {
    private d: TextDecoder;
    constructor(l: string, o?: TextDecoderOptions) {
      if (!/^utf-?8$/i.test(l)) throw new RangeError(l);
      this.d = new nativeTD('utf-8', o);
    }
    decode(x: Uint8Array) {
      return this.d.decode(x);
    }
  };
  r = decodeSgfBytes(bytes('(;CA[GBK]C[', GBK, '];B[aa])'));
  (globalThis as any).TextDecoder = nativeTD;
  assert.ok(r.text.includes('黑先这个活'), 'polyfill path');

  // real-world collections: preamble text with parentheses is not a puzzle
  const coll = [
    'Intro text (see http://example.org/) here.',
    '(;SZ[19];AW[pb][qb]AB[ob]PL[2](;W[sa])(;W[sb]TR[sb]))',
    '(;SZ[19]AB[aa];B[bb])',
  ].join('\n');
  assert.equal(splitCollection(coll).length, 2);
  // FF[3]-style: setup in 2nd node, PL[2], triangle-on-move = wrong
  const old = splitCollection(coll)[0];
  assert.ok(validateSgf(old).errors.length, 'unnormalized is rejected');
  const prep = prepareSgf(old);
  assert.equal(prep.notes.length, 2);
  assert.deepEqual(validateSgf(prep.sgf).errors, []);
  const oe = new StudyEngine(prep.sgf, 'unguided');
  assert.equal(oe.playerColor, 'W');
  assert.equal(oe.play({ x: 18, y: 1 }), 'wrong', 'triangle branch is wrong');
  assert.equal(oe.play({ x: 18, y: 0 }), 'solved');
  assert.equal(prepareSgf(SAMPLES[0].sgf).sgf, SAMPLES[0].sgf, 'untouched when nothing to fix');
  // empty node between root and setup
  assert.deepEqual(validateSgf(prepareSgf('(;GM[1]SZ[9];;AB[aa]PL[B];B[bb])').sgf).errors, []);

  // archives: gzip and zip are unpacked by magic bytes
  const one = strToU8('(;SZ[9];B[aa])');
  assert.equal(new TextDecoder().decode(expandFile('a.sgf.gz', gzipSync(one))[0].bytes), '(;SZ[9];B[aa])');
  assert.equal(expandFile('a.sgf.gz', gzipSync(one))[0].name, 'a.sgf');
  const z = expandFile('pack.zip', zipSync({ 'dir/b.sgf': one, 'c.sgf': one, 'readme.md': one, '__MACOSX/._b.sgf': one }));
  assert.deepEqual(z.map((f) => f.name), ['c.sgf', 'dir/b.sgf']);
  assert.equal(expandFile('plain.sgf', one).length, 1);
  assert.throws(() => expandFile('x.zip', zipSync({ 'b.png': one })), /No .sgf/);
  assert.equal(baseName('dir/xxqj.sgf.gz'), 'xxqj');

  // skill
  const mk = (correct: boolean, ms: number): Attempt => ({ correct, ms, parMs: 10000, at: 0 });
  assert.equal(computeSkill([]).level, 'new');
  assert.equal(computeSkill([mk(false, 5000), mk(false, 5000)]).level, 'red');
  assert.equal(computeSkill(Array(6).fill(mk(true, 8000))).level, 'gold');
  assert.equal(computeSkill(Array(6).fill(mk(true, 60000))).level, 'yellow');
});

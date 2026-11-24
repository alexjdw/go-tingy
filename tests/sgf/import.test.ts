import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gzipSync, strToU8, zipSync } from 'fflate';
import {
  addToBatch,
  normalize,
  readPickedFile,
  selectValid,
  summarize,
  toProblems,
  toggleEntry,
} from '../../src/sgf/importer';
import type { BatchItem, Entry } from '../../src/sgf/importer';
import { fixtureBytes, fixtureText } from '../lib/helpers';
import { splitCollection } from '../../src/sgf/parser';

const none = new Set<string>();
const pick = (name: string): BatchItem[] => readPickedFile(name, fixtureBytes(name));

describe('Import SGF → "Choose files"', () => {
  it('unpacks a .sgf.gz collection into one batch item', () => {
    const items = pick('xxqj.sgf.gz');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'xxqj');
    assert.equal(items[0].encoding, undefined, 'plain ASCII/UTF-8 needs no encoding note');
    assert.match(items[0].text, /These are the 347 problems/);
  });

  it('splits xxqj into 347 puzzles, rejecting only the one with an immediate ko retake', () => {
    const entries = addToBatch([], none, pick('xxqj.sgf.gz'));
    assert.deepEqual(summarize(entries), { total: 347, invalid: 1, duplicates: 0, selected: 346 });
    const bad = entries.find((e) => e.v.errors.length)!;
    assert.match(bad.v.errors[0], /Illegal black move/);
    assert.equal(bad.include, false);
    assert.ok(entries.every((e) => e.collection === 'xxqj'));
    assert.equal(entries[0].title, 'xxqj #1');
    assert.equal(new Set(entries.map((e) => e.title)).size, 347, 'titles are unique');
  });

  it('numbers puzzles that all share one GN (gzp1 uses GN[GZP1] for every puzzle)', () => {
    const entries = addToBatch([], none, pick('gzp1.sgf.gz'));
    assert.deepEqual(summarize(entries), { total: 539, invalid: 1, duplicates: 0, selected: 538 });
    assert.equal(entries[0].title, 'GZP1 #1');
    assert.equal(entries[538].title, 'GZP1 #539');
    assert.equal(new Set(entries.map((e) => e.title)).size, 539);
    const bad = entries.find((e) => e.v.errors.length)!;
    assert.match(bad.v.errors[0], /no moves/);
  });

  it('ignores the parenthesized preamble in qjzm and normalizes its old-style trees', () => {
    const entries = addToBatch([], none, pick('qjzm-a.sgf.gz'));
    assert.deepEqual(summarize(entries), { total: 85, invalid: 0, duplicates: 0, selected: 85 });
    assert.ok(entries.every((e) => e.v.warnings.some((w) => /setup stones from a later node/.test(w))));
    const withTriangles = entries.filter((e) =>
      e.v.warnings.some((w) => /triangle on the move treated as wrong/.test(w)),
    );
    assert.equal(withTriangles.length, 45, '24 + 21 puzzles carry triangle-marked wrong branches');
  });

  it('.zip and .sgf.gz of the same collection import identically', () => {
    const gz = pick('qjzm-a.sgf.gz');
    const zip = pick('qjzm-a.zip');
    assert.equal(zip.length, 1);
    assert.equal(zip[0].name, 'qjzm-a');
    assert.equal(zip[0].text, gz[0].text);
  });

  it('flags re-imports as duplicates, within a batch and against the library', () => {
    const a = addToBatch([], none, pick('qjzm-a.sgf.gz'));
    const b = addToBatch(a, none, pick('qjzm-a.zip'));
    assert.deepEqual(summarize(b), { total: 170, invalid: 0, duplicates: 85, selected: 85 });
    assert.ok(b.slice(85).every((e) => e.dup && !e.include));

    const library = new Set(toProblems(a).map((p) => normalize(p.sgf)));
    const again = addToBatch([], library, pick('qjzm-a.zip'));
    assert.deepEqual(summarize(again), { total: 85, invalid: 0, duplicates: 85, selected: 0 });
  });

  it('accepts several files at once and keeps collections apart', () => {
    const entries = addToBatch([], none, [...pick('qjzm-a.sgf.gz'), ...pick('xxqj.sgf.gz')]);
    assert.equal(summarize(entries).total, 85 + 347);
    assert.deepEqual([...new Set(entries.map((e) => e.collection))], ['qjzm-a', 'xxqj']);
  });

  it('turns the checked entries into library problems with unique ids', () => {
    const entries = addToBatch([], none, pick('xxqj.sgf.gz'));
    const problems = toProblems(entries, 1234);
    assert.equal(problems.length, 346);
    assert.equal(new Set(problems.map((p) => p.id)).size, 346);
    assert.ok(problems.every((p) => p.id.startsWith('c-1234-') && p.collection === 'xxqj' && p.sgf.startsWith('(;')));
  });

  it('lets you toggle valid entries but never include an invalid one', () => {
    let entries = addToBatch([], none, pick('xxqj.sgf.gz'));
    const bad = entries.find((e) => e.v.errors.length)!;
    const good = entries.find((e) => !e.v.errors.length)!;
    entries = toggleEntry(entries, bad.key);
    assert.equal(entries.find((e) => e.key === bad.key)!.include, false);
    entries = toggleEntry(entries, good.key);
    assert.equal(summarize(entries).selected, 345);
    entries = selectValid(entries);
    assert.equal(summarize(entries).selected, 346, '"Select valid" restores the full set');
  });

  it('reports unreadable archives instead of importing garbage', () => {
    assert.throws(() => readPickedFile('empty.zip', zipSync({ 'notes.png': strToU8('x') })), /No \.sgf files/);
    const gz = gzipSync(strToU8('(;SZ[9];B[aa])'));
    assert.throws(() => readPickedFile('broken.sgf.gz', gz.slice(0, gz.length - 12)));
  });

  it('decodes a legacy-encoded file and records how, without touching UTF-8 files', () => {
    // GBK bytes for 黑先这个活 inside a comment, no CA declared
    const gbk = Uint8Array.from([
      ...Buffer.from('(;SZ[9]AB[aa]C['),
      0xba,
      0xda,
      0xcf,
      0xc8,
      0xd5,
      0xe2,
      0xb8,
      0xf6,
      0xbb,
      0xee,
      ...Buffer.from('];B[bb]TE[1])'),
    ]);
    const [item] = readPickedFile('legacy.sgf', gbk);
    assert.equal(item.encoding, 'gbk (detected)');
    const [entry] = addToBatch([], none, [item]);
    assert.equal(entry.encoding, 'gbk (detected)');
    assert.ok(entry.sgf.includes('黑先这个活'));
    assert.equal(readPickedFile('plain.sgf', strToU8('(;SZ[9];B[aa])'))[0].encoding, undefined);
  });
});

describe('Import SGF → "Add pasted text"', () => {
  const paste = (text: string, existing = none): Entry[] => addToBatch([], existing, [{ name: 'Pasted puzzle', text }]);
  const xxqjFirst = splitCollection(fixtureText('xxqj.sgf.gz'))[0];

  it('accepts one pasted puzzle', () => {
    const [e, ...rest] = paste(xxqjFirst);
    assert.equal(rest.length, 0);
    assert.equal(e.title, 'Pasted puzzle');
    assert.equal(e.collection, undefined, 'single puzzles are not part of a collection');
    assert.equal(e.include, true);
    assert.deepEqual(e.v.errors, []);
    assert.deepEqual(e.v.dims, { cols: 19, rows: 19 });
  });

  it('accepts a whole pasted collection, preamble and all', () => {
    const entries = paste(fixtureText('qjzm-a.sgf.gz'));
    assert.deepEqual(summarize(entries), { total: 85, invalid: 0, duplicates: 0, selected: 85 });
    assert.equal(entries[0].title, 'Pasted puzzle #1');
    assert.equal(entries[0].collection, 'Pasted puzzle');
  });

  it('treats CRLF / re-wrapped text as the same puzzle (duplicate detection ignores whitespace)', () => {
    const library = new Set([normalize(xxqjFirst)]);
    const crlf = xxqjFirst.replace(/\n/g, '\r\n');
    const [e] = paste(crlf, library);
    assert.equal(e.dup, true);
    assert.equal(e.include, false);
    const [fresh] = paste(crlf);
    assert.equal(fresh.include, true, 'a paste with line-ending changes still parses');
  });

  it('shows why bad pastes are rejected', () => {
    const [junk] = paste('hello world');
    assert.equal(junk.include, false);
    assert.ok(junk.v.errors.length);

    const [illegal] = paste('(;SZ[9]AB[ba][ab];W[aa])');
    assert.match(illegal.v.errors[0], /Illegal white move at A9/);

    const [offBoard] = paste('(;SZ[9];B[jj])');
    assert.match(offBoard.v.errors[0], /outside the 9×9 board/);

    const [noMoves] = paste('(;SZ[9]AB[aa])');
    assert.match(noMoves.v.errors[0], /no moves/);

    const [blank] = paste('   \n  ');
    assert.deepEqual(blank.v.errors, ['File is empty']);
  });

  it('keeps good puzzles when part of a pasted collection is bad', () => {
    const entries = paste('(;SZ[9];B[aa]TE[1])\n(;SZ[9]AB[aa])\n(;SZ[9];W[bb]TE[1])');
    assert.deepEqual(summarize(entries), { total: 3, invalid: 1, duplicates: 0, selected: 2 });
    assert.equal(toProblems(entries).length, 2);
  });
});

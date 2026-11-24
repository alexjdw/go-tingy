import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Problem } from '../../src/data/samples';
import {
  captionOf,
  childFolders,
  collectionsOf,
  inFolder,
  layoutPaths,
  placeAll,
  renameCollection,
  suggestName,
} from '../../src/sgf/folders';
import { addToBatch, readPickedFile, readPickedFolder, toProblems } from '../../src/sgf/importer';
import { zipSync, strToU8 } from 'fflate';

const p = (id: string, collection?: string, folder?: string): Problem => ({
  id,
  title: id,
  sgf: '(;)',
  collection,
  folder,
});
const SGF = (n: number) => `(;GM[1]SZ[9]PL[B]AB[a${'abcdefghi'[n]}]AW[bb](;B[cc]))`;
const enc = (s: string) => strToU8(s);

describe('layoutPaths', () => {
  it('uses the one top folder as the collection name and keeps the folders below it', () => {
    const r = layoutPaths(['Tesuji/Part 1/a.sgf', 'Tesuji/Part 1/Peep/b.sgf', 'Tesuji/c.sgf'], 'zipname');
    assert.equal(r.collection, 'Tesuji');
    assert.deepEqual(r.items, [
      { name: 'a.sgf', folder: 'Part 1' },
      { name: 'b.sgf', folder: 'Part 1/Peep' },
      { name: 'c.sgf', folder: undefined },
    ]);
  });

  it('falls back to the label when there is no single top folder, and understands backslashes', () => {
    const r = layoutPaths(['a\\x.sgf', 'b/y.sgf'], 'pack');
    assert.equal(r.collection, 'pack');
    assert.deepEqual(r.items, [
      { name: 'x.sgf', folder: 'a' },
      { name: 'y.sgf', folder: 'b' },
    ]);
  });

  it('gives a lone file no collection', () => {
    assert.deepEqual(layoutPaths(['one.sgf'], 'one'), { items: [{ name: 'one.sgf' }] });
  });
});

describe('browsing folders', () => {
  const lib = [p('1', 'A', 'x'), p('2', 'A', 'x/y'), p('3', 'A', 'z'), p('4', 'A'), p('5', 'B', 'x')];

  it('counts collections and the folders below a folder', () => {
    assert.deepEqual(collectionsOf(lib), [
      ['A', 4],
      ['B', 1],
    ]);
    assert.deepEqual(childFolders(lib, 'A', null), [
      ['x', 2],
      ['z', 1],
    ]);
    assert.deepEqual(childFolders(lib, 'A', 'x'), [['y', 1]]);
  });

  it('shows a folder with everything inside it', () => {
    assert.deepEqual(
      lib.filter((q) => q.collection === 'A' && inFolder(q, 'x')).map((q) => q.id),
      ['1', '2'],
    );
    assert.equal(inFolder(p('9', 'A', 'xx'), 'x'), false, 'a look-alike folder name is not inside');
    assert.equal(inFolder(p('9', 'A'), null), true);
  });

  it('shows the collection and the last folder under a tile', () => {
    assert.equal(captionOf(p('1', 'A', 'x/y')), 'A › y');
    assert.equal(captionOf(p('1', 'A')), 'A');
    assert.equal(captionOf(p('1')), undefined);
  });
});

describe('renaming a collection', () => {
  const lib = [p('1', 'A', 'x'), p('2', 'B')];
  it('renames, trims, merges into an existing name, and ignores empty names', () => {
    assert.deepEqual(
      renameCollection(lib, 'A', '  New  ').map((q) => q.collection),
      ['New', 'B'],
    );
    assert.deepEqual(
      renameCollection(lib, 'A', 'B').map((q) => q.collection),
      ['B', 'B'],
    );
    assert.equal(renameCollection(lib, 'A', '   '), lib);
    assert.equal(renameCollection(lib, 'A', 'A'), lib);
    assert.equal(renameCollection(lib, 'A', 'New')[0].folder, 'x', 'folders are kept');
  });
});

describe('naming an import', () => {
  it('puts everything in the chosen collection, with one folder per source file when there are several', () => {
    const one = placeAll([{ collection: 'f1' }, { collection: 'f1' }], 'My set');
    assert.deepEqual(
      one,
      [{ collection: 'My set' }, { collection: 'My set' }].map((x) => ({ ...x, folder: undefined })),
    );
    const two = placeAll([{ collection: 'f1' }, { collection: 'f2', folder: 'sub' }, {}], 'My set');
    assert.deepEqual(two, [
      { collection: 'My set', folder: 'f1' },
      { collection: 'My set', folder: 'f2/sub' },
      { collection: 'My set', folder: undefined },
    ]);
  });

  it('no name means no collection', () => {
    assert.deepEqual(placeAll([{ collection: 'f1', folder: 'x' }], null), [{}]);
    assert.deepEqual(placeAll([{ collection: 'f1' }], '  '), [{}]);
  });

  it('suggests the most common source name', () => {
    assert.equal(suggestName([{ collection: 'a' }, { collection: 'b' }, { collection: 'b' }]), 'b');
    assert.equal(suggestName([{}, {}]), 'New collection');
  });

  it('turns a folder in a zip into a named collection with folders', () => {
    const zip = zipSync({
      'Tesuji/Part 1/a.sgf': enc(SGF(0)),
      'Tesuji/Part 1/b.sgf': enc(SGF(1)),
      'Tesuji/Part 2/c.sgf': enc(SGF(2)),
    });
    const batch = readPickedFile('pack.zip', zip);
    assert.deepEqual(
      batch.map((b) => [b.name, b.collection, b.folder]),
      [
        ['a', 'Tesuji', 'Part 1'],
        ['b', 'Tesuji', 'Part 1'],
        ['c', 'Tesuji', 'Part 2'],
      ],
    );
    const entries = addToBatch([], new Set(), batch);
    assert.equal(suggestName(entries), 'Tesuji');
    const named = toProblems(entries, 1, 'Wu Qingyuan');
    assert.deepEqual(
      named.map((q) => [q.collection, q.folder]),
      [
        ['Wu Qingyuan', 'Part 1'],
        ['Wu Qingyuan', 'Part 1'],
        ['Wu Qingyuan', 'Part 2'],
      ],
    );
    assert.ok(toProblems(entries, 1, null).every((q) => !q.collection && !q.folder));
  });

  it('reads a picked folder: the top folder suggests the name, files that are not puzzles are skipped', () => {
    const files = [
      { path: 'Set/1.Tesuji/a.sgf', bytes: enc(SGF(0)) },
      { path: 'Set/1.Tesuji/readme.doc', bytes: enc('hello') },
      { path: 'Set/2.Life/b.sgf', bytes: enc(SGF(1)) },
      { path: 'Set/many.sgf', bytes: enc(`${SGF(3)}${SGF(4)}`) },
    ];
    const entries = addToBatch([], new Set(), readPickedFolder(files));
    assert.equal(entries.length, 4);
    assert.ok(entries.every((e) => e.collection === 'Set'));
    assert.deepEqual(
      entries.map((e) => e.folder),
      ['1.Tesuji', '2.Life', 'many', 'many'],
    );
  });
});

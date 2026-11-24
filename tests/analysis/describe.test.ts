import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeFinding, describeVerdict } from '../../src/analysis/describe';
import type { FindingKind } from '../../src/analysis/review';
import { nodeByKey, nodeKey } from '../../src/study/lines';
import { parseSgf } from '../../src/sgf/parser';

const dims = { cols: 9, rows: 9 };

describe('describing findings', () => {
  it('says where and what, for every kind', () => {
    const kinds: FindingKind[] = [
      'marked-correct-engine-disagrees',
      'marked-wrong-engine-likes',
      'unmarked-engine-dislikes',
      'missing-reply',
      'missing-move',
    ];
    for (const kind of kinds) {
      const text = describeFinding({ kind, key: 'B:cc;W:dd', point: { x: 2, y: 2 } }, dims);
      assert.match(text, /^After 2 moves: /);
      assert.match(text, /C7/);
    }
    assert.match(describeFinding({ kind: 'missing-move', key: '', point: null }, dims), /^At the start: .*a pass/);
    assert.match(describeFinding({ kind: 'missing-move', key: 'B:cc', point: null }, dims), /^After 1 move: /);
  });

  it('has a sentence for every verdict', () => {
    for (const v of ['agrees', 'incomplete', 'diverges', 'unjudged'] as const)
      assert.ok(describeVerdict(v).length > 10);
  });
});

describe('finding a node again from its key', () => {
  const root = parseSgf('(;SZ[9]PL[B];B[cc](;W[dd];B[ee])(;W[ff]))');
  it('finds every node, and null for a key that is not there', () => {
    const all = [
      root,
      root.children[0],
      root.children[0].children[0],
      root.children[0].children[1],
      root.children[0].children[0].children[0],
    ];
    for (const n of all) assert.equal(nodeByKey(root, nodeKey(n)), n);
    assert.equal(nodeByKey(root, 'B:cc;W:gg'), null);
    assert.equal(nodeByKey(root, 'W:cc'), null);
  });
});

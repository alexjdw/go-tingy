import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeExchange, describeFinding, describeVerdict } from '../../src/analysis/describe';
import { judgeMove } from '../../src/analysis/suggest';
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

describe('describing an exchange', () => {
  const fav = { point: { x: 4, y: 4 }, winrate: 0.6, scoreLead: 5, visits: 50, prior: 0.5, line: [] };
  const base = { mover: 'Black', move: 'G3', answer: 'E5', chance: 4, favorite: 'D4', dims };

  it('says a refuted move was marked wrong, and what it gave away', () => {
    const text = describeExchange({ ...base, judgement: judgeMove(fav, 0.96, 20), marked: true });
    assert.match(text, /KataGo answered E5/);
    assert.match(text, /G3 looks wrong: it gives away 56% of the win chance and 25 points compared with D4/);
    assert.match(text, /marked incorrect/);
  });

  it('only mentions a weaker move, and says nothing more for a fine one or when it could not judge', () => {
    const weaker = describeExchange({ ...base, judgement: judgeMove(fav, 0.6, 0), marked: false });
    assert.match(weaker, /G3 is weaker than D4/);
    const notEnough = describeExchange({ ...base, judgement: judgeMove(fav, 0.65, 4), marked: false });
    assert.match(notEnough, /weaker than D4.*gives away/, 'a clear loss that is not marked is still said');
    assert.doesNotMatch(weaker, /marked/);
    const fine = describeExchange({ ...base, judgement: judgeMove(fav, 0.4, -5), marked: false });
    assert.equal(fine, "KataGo answered E5. Black's chance after that: 4%.");
    assert.equal(describeExchange({ ...base, judgement: null, marked: false }), fine);
  });
});

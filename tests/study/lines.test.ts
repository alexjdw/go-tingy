import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enumerateLines, isUnder, learnerDepth, linesOf, nodeKey } from '../../src/study/lines';
import { boardDims, firstMoveColor, parseSgf } from '../../src/sgf/parser';
import { BRANCHY, fixtureProblem } from '../lib/helpers';

describe('puzzle lines', () => {
  it('counts the lines of a branching puzzle and ignores wrong branches', () => {
    const l = linesOf(BRANCHY);
    assert.equal(l.leaves.length, 3);
    assert.deepEqual(l.leaves, ['B:cc;W:dd;B:ee', 'B:cc;W:ff;B:gg', 'B:jj;W:kk;B:ll']);
    assert.equal(l.maxLearnerMoves, 2);
    assert.equal(l.truncated, false);
  });

  it('measures real puzzles', () => {
    assert.equal(learnerDepth(fixtureProblem('xxqj.sgf.gz', 0)), 6);
    assert.equal(linesOf(fixtureProblem('xxqj.sgf.gz', 0)).leaves.length, 1);
    const q3 = linesOf(fixtureProblem('qjzm-a.sgf.gz', 2));
    assert.equal(q3.leaves.length, 2, 'the two triangle-marked refutations are not lines');
    assert.equal(q3.maxLearnerMoves, 3);
  });

  it('node keys are stable across separate parses, and isUnder follows the tree', () => {
    const a = parseSgf(BRANCHY);
    const b = parseSgf(BRANCHY);
    assert.equal(nodeKey(a), '');
    assert.equal(nodeKey(a.children[0].children[1]), nodeKey(b.children[0].children[1]));
    assert.equal(nodeKey(a.children[0].children[1]), 'B:cc;W:ff');
    assert.equal(isUnder('B:cc;W:ff;B:gg', 'B:cc'), true);
    assert.equal(isUnder('B:cc;W:ff;B:gg', ''), true);
    assert.equal(isUnder('B:cc;W:ff;B:gg', 'B:c'), false, 'a prefix of the text is not an ancestor');
    assert.equal(isUnder('B:jj;W:kk', 'B:cc'), false);
  });

  it('caps runaway trees', () => {
    const many = Array.from(
      { length: 250 },
      (_, i) => `(;B[${String.fromCharCode(97 + (i % 19))}${String.fromCharCode(97 + ((i / 19) | 0) + 2)}]TE[1])`,
    ).join('');
    const sgf = `(;SZ[19]PL[B]AB[aa]${many})`;
    const root = parseSgf(sgf);
    const set = enumerateLines(root, boardDims(root), firstMoveColor(root));
    assert.equal(set.leaves.length, 200);
    assert.equal(set.truncated, true);
  });
});

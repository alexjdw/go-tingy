import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../../src/study/engine';
import { preferredChild } from '../../src/study/lines';
import { layoutTree } from '../../src/study/treeLayout';
import { boardDims, parseSgf } from '../../src/sgf/parser';

// the first branch at the start is wrong, the second leads to a correct move
const SGF = '(;GM[1]SZ[9]PL[B](;B[aa]BM[1];W[bb])(;B[cc](;W[dd];B[ee]TE[1])(;W[ff];B[gg])))';
const at = (x: number, y: number) => ({ x, y });

describe('stepping through the tree in explore mode', () => {
  it('forward prefers the branch that leads to a correct move, then keeps going to the end', () => {
    const e = new StudyEngine(SGF, 'explore');
    assert.equal(e.canBack, false);
    assert.equal(e.forward(), true);
    assert.deepEqual(e.snap.last, at(2, 2), 'skipped the wrong first branch');
    assert.equal(e.forward(), true);
    assert.deepEqual(e.snap.last, at(3, 3), 'took the line with the correct mark');
    assert.equal(e.forward(), true);
    assert.equal(e.snap.board.get(at(4, 4)), 'B');
    assert.equal(e.canForward, false);
    assert.equal(e.forward(), false);
  });

  it('back returns to the parent, with the stone gone, and stops at the start', () => {
    const e = new StudyEngine(SGF, 'explore');
    e.forward();
    e.forward();
    assert.equal(e.back(), true);
    assert.deepEqual(e.snap.last, at(2, 2));
    assert.equal(e.snap.board.get(at(3, 3)), null);
    assert.equal(e.snap.toPlay, 'W');
    assert.equal(e.back(), true);
    assert.equal(e.snap.node, e.root);
    assert.equal(e.back(), false);
    assert.equal(e.canUndo, false, 'Undo follows the same steps');
  });

  it('with no correct mark anywhere, forward avoids a move marked wrong, and falls back to the first branch', () => {
    const none = parseSgf('(;SZ[9]PL[B](;B[aa]BM[1])(;B[cc]))');
    assert.equal(preferredChild(none)?.props.B?.[0], 'cc');
    const bare = parseSgf('(;SZ[9]PL[B](;B[aa])(;B[cc]))');
    assert.equal(preferredChild(bare)?.props.B?.[0], 'aa');
    assert.equal(preferredChild(parseSgf('(;SZ[9])')), null);
  });

  it('after leaving the tree, back goes to the previous position, and then follows the tree again', () => {
    const e = new StudyEngine(SGF, 'explore');
    e.forward();
    assert.equal(e.play(at(5, 0)), 'ok'); // White plays off the book
    assert.equal(e.snap.node, null);
    assert.equal(e.canForward, false);
    assert.equal(e.canBack, true);
    assert.equal(e.back(), true);
    assert.deepEqual(e.snap.last, at(2, 2));
    assert.ok(e.snap.node);
    assert.equal(e.snap.board.get(at(5, 0)), null);
    assert.equal(e.forward(), true);
  });

  it('jumpTo goes to any node of the tree, and refuses one from another tree', () => {
    const e = new StudyEngine(SGF, 'explore');
    const deep = e.root.children[1].children[1].children[0]; // B[gg]
    assert.equal(e.jumpTo(deep), true);
    assert.equal(e.snap.board.get(at(6, 6)), 'B');
    assert.equal(e.snap.board.get(at(5, 5)), 'W');
    assert.equal(e.snap.board.get(at(3, 3)), null, 'the other branch is not on the board');
    assert.equal(e.snap.toPlay, 'W');
    assert.equal(e.jumpTo(parseSgf(SGF)), false);
    assert.equal(new StudyEngine(SGF, 'unguided').jumpTo(e.root), false, 'only in explore mode');
  });

  it('keeps the colors of a flipped puzzle', () => {
    const e = new StudyEngine(SGF, 'explore', { flipped: true });
    e.forward();
    assert.equal(e.snap.board.get(at(2, 2)), 'W');
  });
});

describe('the tree layout', () => {
  it('puts the main line on the first row, and each variation on a row below its branch', () => {
    const root = parseSgf(SGF);
    const layout = layoutTree(root, boardDims(root));
    assert.equal(layout.nodes.length, 8);
    assert.equal(layout.cols, 4);
    assert.equal(layout.rows, 3);
    const rows = (path: number[]) => {
      let n = root;
      for (const i of path) n = n.children[i];
      return layout.at.get(n)!.row;
    };
    assert.equal(rows([]), 0, 'the start sits on its first line');
    assert.equal(rows([0]), 0);
    assert.equal(rows([0, 0]), 0);
    assert.equal(rows([1]), 1, 'the second line of play drops below');
    assert.equal(rows([1, 0, 0]), 1);
    assert.equal(rows([1, 1]), 2, 'the next variation goes lower still');
    assert.equal(layout.at.get(root.children[0])!.mark, 'wrong');
    assert.equal(layout.at.get(root.children[1].children[0].children[0])!.mark, 'correct');
  });

  it('a start position with no moves is one node', () => {
    const root = parseSgf('(;SZ[9])');
    const l = layoutTree(root, boardDims(root));
    assert.deepEqual([l.nodes.length, l.cols, l.rows], [1, 1, 1]);
  });
});

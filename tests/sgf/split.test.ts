import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canSplitAt, splitAt } from '../../src/sgf/split';
import { boardDims, flipColors, parseSgf, pointList } from '../../src/sgf/parser';
import { initialBoard } from '../../src/go/setup';
import { validateSgf } from '../../src/sgf/validate';

// Black cc, White dd, then two lines: Black ee (correct) or Black ff (wrong)
const SGF = '(;GM[1]SZ[9]PL[B]AB[aa]AW[bb];B[cc];W[dd](;B[ee]TE[1];W[gg])(;B[ff]BM[1]))';
const nodeAt = (root: ReturnType<typeof parseSgf>, ...kids: number[]) => kids.reduce((n, i) => n.children[i], root);

describe('splitting a puzzle at a node', () => {
  it('the position at the node becomes the starting stones, and what follows becomes the tree', () => {
    const root = parseSgf(SGF);
    const out = splitAt(root, nodeAt(root, 0, 0))!; // after W dd
    const n = parseSgf(out);
    assert.deepEqual(n.props.AB.slice().sort(), ['aa', 'cc']);
    assert.deepEqual(n.props.AW.slice().sort(), ['bb', 'dd']);
    assert.deepEqual(n.props.PL, ['B']);
    assert.equal(n.props.SZ[0], '9');
    assert.equal(n.children.length, 2);
    assert.deepEqual(n.children[0].props.B, ['ee']);
    assert.deepEqual(n.children[0].props.TE, ['1']);
    assert.deepEqual(n.children[0].children[0].props.W, ['gg']);
    assert.deepEqual(n.children[1].props.BM, ['1']);
    assert.equal(validateSgf(out).errors.length, 0);
  });

  it('the first player is whoever moves next, even when the tree starts with the other color', () => {
    const root = parseSgf(SGF);
    const out = parseSgf(splitAt(root, nodeAt(root, 0))!); // after B cc: White to move
    assert.deepEqual(out.props.PL, ['W']);
    assert.deepEqual(out.children[0].props.W, ['dd']);
  });

  it('captured stones are not in the new puzzle', () => {
    const cap = parseSgf('(;SZ[9]PL[B]AB[ba]AW[aa];B[ab];W[ee];B[ff])'); // Black captures the corner stone
    const out = parseSgf(splitAt(cap, cap.children[0])!);
    assert.equal(out.props.AW?.includes('aa') ?? false, false);
    assert.deepEqual(out.props.AB.slice().sort(), ['ab', 'ba']);
    assert.equal(pointList(out.props.AW, boardDims(out)).length, 0);
  });

  it('keeps the borders that were open, and does not touch the original tree', () => {
    const root = parseSgf('(;SZ[9]OE[tr]PL[B]AB[aa];B[bb];W[cc];B[dd])');
    const before = JSON.stringify(root.props) + root.children.length;
    const out = parseSgf(splitAt(root, root.children[0])!);
    assert.equal(out.props.OE[0], 'tr');
    assert.equal(JSON.stringify(root.props) + root.children.length, before);
    out.children[0].props.W = ['zz'];
    assert.deepEqual(root.children[0].children[0].props.W, ['cc'], 'the new tree is a copy');
  });

  it('a puzzle shown flipped is split in its original colors', () => {
    const shown = parseSgf(SGF);
    flipColors(shown); // what the engine holds when the colors are flipped
    const out = parseSgf(splitAt(shown, nodeAt(shown, 0, 0), true)!);
    const plain = parseSgf(SGF);
    const original = parseSgf(splitAt(plain, nodeAt(plain, 0, 0))!);
    assert.deepEqual(out.props.AB.slice().sort(), original.props.AB.slice().sort());
    assert.deepEqual(out.props.PL, original.props.PL);
    assert.deepEqual(out.children[0].props.B, ['ee']);
    const board = initialBoard(out, boardDims(out));
    assert.equal(board.get({ x: 2, y: 2 }), 'B');
  });

  it('there is nothing to split at the start, at the end of a line, or in another tree', () => {
    const root = parseSgf(SGF);
    assert.equal(canSplitAt(root, root), false);
    assert.equal(canSplitAt(root, nodeAt(root, 0, 0, 1)), false, 'B ff ends its line');
    assert.equal(splitAt(root, nodeAt(root, 0, 0, 1)), null);
    assert.equal(canSplitAt(root, nodeAt(parseSgf(SGF), 0)), false);
    assert.equal(canSplitAt(root, nodeAt(root, 0)), true);
  });
});

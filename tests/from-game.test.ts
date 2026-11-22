import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkCrop,
  clampCrop,
  cropDims,
  extractPuzzle,
  fitCrop,
  fullCrop,
  loadGame,
  movesInRange,
  moveSide,
  type Game,
} from '../src/sgf/fromGame';
import { boardDims, openEdges, parseSgf, pointList } from '../src/sgf/parser';

const load = (text: string): Game => {
  const r = loadGame(text);
  assert.ok('game' in r, 'error' in r ? r.error : '');
  return r.game;
};

// Black captures the white stone in the corner on move 3, then the game moves far away.
const CORNER = '(;GM[1]SZ[19]PB[Kuro]PW[Shiro];B[ab];W[aa];B[ba];W[pp];B[dd])';
// A white stone on the edge of a 7-wide window that still has a liberty just outside it.
const EDGE = '(;GM[1]SZ[19];B[fa];W[ga];B[gb])';

describe('loading a game', () => {
  it('reads the moves, the boards after each move and a name', () => {
    const g = load(CORNER);
    assert.equal(g.moves.length, 5);
    assert.equal(g.boards.length, 6);
    assert.equal(g.name, 'Shiro vs Kuro');
    assert.equal(g.boards[2].get({ x: 0, y: 0 }), 'W');
    assert.equal(g.boards[3].get({ x: 0, y: 0 }), null, 'captured on move 3');
  });

  it('starts from handicap stones', () => {
    const g = load('(;GM[1]SZ[9]HA[2]AB[cc][gg];W[ee])');
    assert.equal(g.boards[0].get({ x: 2, y: 2 }), 'B');
    assert.equal(g.boards[1].get({ x: 6, y: 6 }), 'B');
  });

  it('uses the first game of a collection and says how many there were', () => {
    const g = load(`${CORNER}\n${EDGE}`);
    assert.equal(g.gamesInFile, 2);
    assert.equal(g.moves.length, 5);
  });

  it('skips illegal moves and rejects text that is not a game', () => {
    const g = load('(;GM[1]SZ[9];B[aa];W[aa];B[bb])');
    assert.deepEqual(
      g.moves.map((m) => m.legal),
      [true, false, true],
    );
    assert.deepEqual(movesInRange(g, 0, 3), [1, 3]);
    assert.ok('error' in loadGame('hello'));
    assert.ok('error' in loadGame('(;GM[1]SZ[9])'), 'no moves');
  });
});

describe('cropping', () => {
  it('fits the moves with room, snaps to a near edge, and is at least 7 wide', () => {
    const g = load(CORNER);
    const c = fitCrop(g, 0, 3);
    assert.deepEqual(c, { x0: 0, y0: 0, x1: 6, y1: 6 });
    const far = fitCrop(g, 3, 5); // W[pp] then B[dd]: a box that spans most of the board
    assert.ok(far.x0 <= 3 && far.x1 >= 15);
    assert.ok(cropDims(clampCrop({ x0: 5, y0: 5, x1: 6, y1: 6 }, g.dims)).cols >= 7);
  });

  it('keeps a crop on the board', () => {
    const d = { cols: 9, rows: 9 };
    assert.deepEqual(clampCrop({ x0: -4, y0: -4, x1: 40, y1: 40 }, d), fullCrop(d));
    assert.deepEqual(cropDims(clampCrop({ x0: 8, y0: 8, x1: 8, y1: 8 }, d)), { cols: 7, rows: 7 });
  });

  it('flags moves outside the crop', () => {
    const g = load(CORNER);
    const c = checkCrop(g, 0, 5, { x0: 0, y0: 0, x1: 6, y1: 6 });
    assert.deepEqual(c.outside, [4]);
  });

  it('flags a crop whose cut edge changes what happens', () => {
    const g = load(EDGE);
    assert.equal(checkCrop(g, 0, 3, { x0: 0, y0: 0, x1: 6, y1: 6 }).differs, 3, 'ga is captured only on the cut board');
    assert.equal(checkCrop(g, 0, 3, { x0: 0, y0: 0, x1: 8, y1: 8 }).differs, null);
  });
});

describe('making the puzzle', () => {
  it('turns the chosen moves into a valid puzzle in the cropped board', () => {
    const g = load(CORNER);
    const out = extractPuzzle(g, { start: 0, end: 3, crop: { x0: 0, y0: 0, x1: 6, y1: 6 }, title: 'Corner' });
    assert.deepEqual(out.validation.errors, []);
    const root = parseSgf(out.sgf);
    assert.deepEqual(boardDims(root), { cols: 7, rows: 7 });
    assert.deepEqual(openEdges(root), { top: false, left: false, right: true, bottom: true });
    assert.equal(root.props.PL?.[0], 'B');
    assert.equal(root.props.GN?.[0], 'Corner');
    let n = root;
    const seen: string[] = [];
    while (n.children[0]) {
      n = n.children[0];
      seen.push(n.props.B?.[0] ?? n.props.W?.[0]);
    }
    assert.deepEqual(seen, ['ab', 'aa', 'ba']);
    assert.ok(n.props.TE, 'the last move is marked correct');
  });

  it('puts the position before the first move on the board, moved to the crop corner', () => {
    const g = load(CORNER);
    // start after move 3 (the capture): the puzzle is moves 4-5, in a window that starts at (3,3)
    const out = extractPuzzle(g, { start: 3, end: 5, crop: { x0: 0, y0: 0, x1: 18, y1: 18 }, title: '' });
    const root = parseSgf(out.sgf);
    const dims = boardDims(root);
    assert.deepEqual(pointList(root.props.AB, dims), [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    assert.equal(root.props.PL?.[0], 'W');
    assert.equal(root.props.GN?.[0], 'Shiro vs Kuro', 'an empty title falls back to the game name');
    assert.equal(openEdges(root).left, false);
  });

  it('shifts coordinates for a crop in the middle of the board', () => {
    const g = load('(;GM[1]SZ[19];B[jj];W[kj])');
    const out = extractPuzzle(g, { start: 1, end: 2, crop: { x0: 7, y0: 7, x1: 13, y1: 13 }, title: 'Mid' });
    const root = parseSgf(out.sgf);
    assert.deepEqual(boardDims(root), { cols: 7, rows: 7 });
    assert.deepEqual(openEdges(root), { top: true, left: true, right: true, bottom: true });
    assert.deepEqual(root.props.AB, ['cc']);
    assert.deepEqual(root.children[0].props.W, ['dc']);
  });

  it('reports a crop problem instead of hiding it', () => {
    const g = load(CORNER);
    const out = extractPuzzle(g, { start: 0, end: 5, crop: { x0: 0, y0: 0, x1: 6, y1: 6 }, title: 'x' });
    assert.deepEqual(out.check.outside, [4]);
  });
});

describe('moving a side of the crop', () => {
  const dims = { cols: 19, rows: 19 };
  const c = { x0: 3, y0: 3, x1: 11, y1: 12 };

  it('grows and shrinks one side at a time', () => {
    assert.deepEqual(moveSide(c, 'left', 1, dims), { ...c, x0: 2 });
    assert.deepEqual(moveSide(c, 'right', 1, dims), { ...c, x1: 12 });
    assert.deepEqual(moveSide(c, 'top', -1, dims), { ...c, y0: 4 });
    assert.deepEqual(moveSide(c, 'bottom', -1, dims), { ...c, y1: 11 });
  });

  it('stops at the board edge and at the smallest size', () => {
    assert.deepEqual(moveSide({ ...c, x0: 0 }, 'left', 1, dims), { ...c, x0: 0 });
    assert.deepEqual(moveSide({ ...c, x1: 18 }, 'right', 1, dims), { ...c, x1: 18 });
    const small = { x0: 3, y0: 3, x1: 9, y1: 9 };
    assert.deepEqual(moveSide(small, 'left', -1, dims), small);
    assert.deepEqual(moveSide(small, 'bottom', -1, dims), small);
  });
});

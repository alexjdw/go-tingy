import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLES } from '../../src/data/samples';
import { THUMB_SIZE, cachedPreview, puzzlePreview, thumbnailWindow } from '../../src/go/thumbnail';
import { StudyEngine } from '../../src/study/engine';
import { initialBoard } from '../../src/go/setup';
import { boardDims, parseSgf, type Point } from '../../src/sgf/parser';
import { pt, seeded, validProblems } from '../lib/helpers';

const covered = (stones: Point[], v: { x0: number; x1: number; y0: number; y1: number }) =>
  stones.filter((p) => p.x >= v.x0 && p.x <= v.x1 && p.y >= v.y0 && p.y <= v.y1).length;

/** The most stones any window of this size could cover (brute force). */
function bestPossible(stones: Point[], dims: { cols: number; rows: number }, size = THUMB_SIZE) {
  const w = Math.min(size, dims.cols);
  const h = Math.min(size, dims.rows);
  let best = 0;
  for (let y0 = 0; y0 <= dims.rows - h; y0++)
    for (let x0 = 0; x0 <= dims.cols - w; x0++)
      best = Math.max(best, covered(stones, { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 }));
  return best;
}

describe('thumbnails: the 7x7 window', () => {
  const d19 = { cols: 19, rows: 19 };

  it('is 7x7 and inside the board', () => {
    const v = thumbnailWindow([pt('jj')], null, d19);
    assert.equal(v.x1 - v.x0 + 1, 7);
    assert.equal(v.y1 - v.y0 + 1, 7);
    assert.ok(v.x0 >= 0 && v.y0 >= 0 && v.x1 <= 18 && v.y1 <= 18);
  });

  it('shows a corner problem with its corner', () => {
    const v = thumbnailWindow([pt('aa'), pt('bb'), pt('ab')], pt('ac'), d19);
    assert.deepEqual(v, { x0: 0, x1: 6, y0: 0, y1: 6 });
  });

  it('shows a far-corner problem with that corner (window snaps to the edge)', () => {
    const v = thumbnailWindow([pt('ss'), pt('rr'), pt('rs')], pt('qs'), d19);
    assert.deepEqual(v, { x0: 12, x1: 18, y0: 12, y1: 18 });
  });

  it('centers on a problem in the middle of the board', () => {
    const v = thumbnailWindow([pt('jj'), pt('ik'), pt('kk')], pt('jk'), d19);
    assert.ok(v.x0 <= 9 && v.x1 >= 9 && v.y0 <= 10 && v.y1 >= 10);
    assert.ok(v.x0 > 2 && v.x1 < 16, 'not snapped to an edge it is far from');
  });

  it('snaps to a nearby edge when nothing is lost', () => {
    // stones at columns 4..6 fit in a window starting at 0, which is within 2 of the edge
    const v = thumbnailWindow([pt('ei'), pt('fi'), pt('gi')], null, d19);
    assert.equal(v.x0, 0);
  });

  it('does not snap if that would lose a stone', () => {
    const v = thumbnailWindow([pt('ei'), pt('fi'), pt('gi'), pt('hi')], null, d19); // columns 4..7 do not fit in 0..6
    assert.notEqual(v.x0, 0);
    assert.equal(covered([pt('ei'), pt('fi'), pt('gi'), pt('hi')], v), 4);
  });

  it('shows as much as possible when the position is wider than the window', () => {
    const stones = [pt('aa'), pt('ba'), pt('ca'), pt('da'), pt('pa'), pt('qa')];
    const v = thumbnailWindow(stones, null, d19);
    assert.equal(covered(stones, v), 4, 'the four on the left fit; the two on the right cannot');
  });

  it('gives the first move extra weight so the window shows where the action starts', () => {
    // one stone on each side; the solution starts on the right
    const stones = [pt('aa'), pt('sa')];
    assert.ok(thumbnailWindow(stones, pt('sb'), d19).x0 > 6, 'follows the focus to the right');
    assert.equal(thumbnailWindow(stones, pt('ab'), d19).x0, 0, 'follows the focus to the left');
  });

  it('uses the whole board when it is smaller than 7 in a direction', () => {
    assert.deepEqual(thumbnailWindow([pt('aa')], null, { cols: 5, rows: 5 }), { x0: 0, x1: 4, y0: 0, y1: 4 });
    assert.deepEqual(thumbnailWindow([pt('aa')], null, { cols: 9, rows: 5 }), { x0: 0, x1: 6, y0: 0, y1: 4 });
    assert.deepEqual(thumbnailWindow([], null, { cols: 3, rows: 12 }), { x0: 0, x1: 2, y0: 0, y1: 6 });
  });

  it('has a valid window even with no stones', () => {
    assert.deepEqual(thumbnailWindow([], null, d19), { x0: 0, x1: 6, y0: 0, y1: 6 });
  });

  it('always covers as many stones as any window could (property test)', () => {
    const rng = seeded(11);
    for (let t = 0; t < 300; t++) {
      const dims = { cols: 5 + Math.floor(rng() * 15), rows: 5 + Math.floor(rng() * 15) };
      const n = Math.floor(rng() * 14);
      const stones = Array.from({ length: n }, () => ({
        x: Math.floor(rng() * dims.cols),
        y: Math.floor(rng() * dims.rows),
      }));
      const v = thumbnailWindow(stones, null, dims);
      assert.ok(v.x0 >= 0 && v.y0 >= 0 && v.x1 < dims.cols && v.y1 < dims.rows, 'inside the board');
      assert.equal(covered(stones, v), bestPossible(stones, dims), `${dims.cols}x${dims.rows}, ${n} stones`);
    }
  });
});

describe('thumbnails: previews of real puzzles', () => {
  it('draw the starting position of every built-in puzzle, entirely in view', () => {
    for (const s of SAMPLES) {
      const p = puzzlePreview(s.sgf);
      assert.ok(p.stones > 0, s.title);
      assert.equal(covered(allStones(p.board), p.view), p.stones, `${s.title}: these small positions fit the window`);
    }
  });

  it('match the engine’s starting position', () => {
    for (const s of SAMPLES) {
      const e = new StudyEngine(s.sgf, 'explore');
      const p = puzzlePreview(s.sgf);
      assert.deepEqual([...p.board.grid], [...e.snap.board.grid], s.title);
      assert.deepEqual(p.dims, e.dims);
    }
  });

  it('crop a big position to what fits, with the most stones possible', () => {
    // a wide, spread-out position
    const sgf = '(;SZ[19]PL[B]AB[aa][ba][ca][da][ea][fa][ga][ha][ia][ja][ka][la][ma];B[ab])';
    const p = puzzlePreview(sgf);
    assert.equal(p.stones, 13);
    assert.equal(covered(allStones(p.board), p.view), 7, 'only 7 of the 13 fit in a 7-wide window');
    assert.ok(p.view.x1 - p.view.x0 === 6);
  });

  it('carry a rectangular board’s shape and its open edges', () => {
    const p = puzzlePreview('(;SZ[9:5]OE[tl]AB[aa]AW[ba];B[ab])');
    assert.deepEqual(p.dims, { cols: 9, rows: 5 });
    assert.deepEqual(p.open, { top: true, left: true, right: false, bottom: false });
    assert.deepEqual(p.view, { x0: 0, x1: 6, y0: 0, y1: 4 });
  });

  it('give every valid puzzle in the collections a window that shows as much as any window could', () => {
    let n = 0;
    for (const file of ['qjzm-a.sgf.gz', 'xxqj.sgf.gz', 'gzp1.sgf.gz']) {
      for (const sgf of validProblems(file)) {
        const p = puzzlePreview(sgf);
        const dims = boardDims(parseSgf(sgf));
        const v = p.view;
        assert.ok(v.x1 - v.x0 + 1 <= 7 && v.y1 - v.y0 + 1 <= 7);
        assert.ok(v.x0 >= 0 && v.y0 >= 0 && v.x1 < dims.cols && v.y1 < dims.rows);
        // the first move's weight may trade a stone for the focus; the window must be within 2 stones of the best
        assert.ok(covered(allStones(p.board), v) >= bestPossible(allStones(p.board), dims) - 2);
        n++;
      }
    }
    assert.ok(n > 900);
  });

  it('are cached, and a broken puzzle gets a blank tile instead of an error', () => {
    const a = cachedPreview(SAMPLES[0].sgf);
    assert.equal(cachedPreview(SAMPLES[0].sgf), a);
    const bad = cachedPreview('this is not sgf');
    assert.equal(bad.stones, 0);
    assert.deepEqual(bad.view, { x0: 0, x1: 6, y0: 0, y1: 6 });
  });

  it('initialBoard puts black, white and cleared points where the SGF says', () => {
    const root = parseSgf('(;SZ[5]AB[aa][bb]AW[cc]AE[bb])');
    const b = initialBoard(root, { cols: 5, rows: 5 });
    assert.equal(b.get(pt('aa')), 'B');
    assert.equal(b.get(pt('bb')), 'B', 'AE is applied first, so AB still places the stone');
    assert.equal(b.get(pt('cc')), 'W');
    assert.equal(b.get(pt('dd')), null);
  });
});

function allStones(board: { cols: number; rows: number; get: (p: Point) => unknown }): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < board.rows; y++) for (let x = 0; x < board.cols; x++) if (board.get({ x, y })) out.push({ x, y });
  return out;
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLES } from '../src/data/samples';
import { THUMB_SIZE, cachedPreview, puzzlePreview, thumbnailWindow } from '../src/go/thumbnail';
import { initialBoard } from '../src/go/setup';
import * as nav from '../src/nav/stack';
import {
  attemptsLeft,
  emptyLearningState,
  localDay,
  recordAttemptStart,
  recordGuidedResult,
  recordTimedResult,
} from '../src/progress/learning';
import { easiestFirst, isEasy, learningAction } from '../src/progress/practice';
import type { Attempt } from '../src/progress/skill';
import { boardDims, parseSgf, type Point } from '../src/sgf/parser';
import { MAX_RETRIES, SESSION_SIZE, SessionQueue, pickSessionIds, shuffle } from '../src/study/session';
import { StudyEngine } from '../src/study/engine';
import { pt, validProblems } from './helpers';

const seeded = (seed: number) => {
  let x = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
};

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

describe('spaced repetition sessions', () => {
  it('shows each puzzle once, in order, then finishes', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    const seen: string[] = [];
    while (!q.done) {
      seen.push(q.current!);
      q.complete(true);
      q.next();
    }
    assert.deepEqual(seen, ['a', 'b', 'c']);
    assert.equal(q.current, null);
    assert.equal(q.total, 3);
  });

  it('brings a puzzle back once at the end if it was not solved cleanly', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    const seen: string[] = [];
    while (!q.done) {
      seen.push(q.current!);
      q.complete(q.current !== 'b' || seen.filter((x) => x === 'b').length > 1); // b fails once, then succeeds
      q.next();
    }
    assert.deepEqual(seen, ['a', 'b', 'c', 'b']);
    assert.equal(q.total, 4, 'the session grew by the retry');
  });

  it('retries a puzzle at most MAX_RETRIES times, so the session always ends', () => {
    assert.equal(MAX_RETRIES, 1);
    const q = new SessionQueue(['a']);
    let showings = 0;
    while (!q.done) {
      assert.ok(showings++ < 10, 'did not end');
      q.complete(false);
      q.next();
    }
    assert.equal(showings, 2, 'shown once, retried once');
  });

  it('counts each puzzle once, by how its first showing went', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    const outcome: Record<string, boolean[]> = { a: [true], b: [false, true], c: [false, false] };
    while (!q.done) {
      q.complete(outcome[q.current!].shift()!);
      q.next();
    }
    assert.deepEqual(q.stats(), { reviewed: 3, firstTry: 1, missed: 2, skipped: 0, retriesCleared: 1 });
  });

  it('only records a puzzle once, however often the result arrives', () => {
    const q = new SessionQueue(['a', 'b']);
    q.complete(false);
    q.complete(false);
    q.complete(true);
    assert.equal(q.results.length, 1);
    assert.equal(q.total, 3, 'only one retry was queued');
    assert.equal(q.isAnswered, true);
    q.next();
    assert.equal(q.isAnswered, false);
  });

  it('can skip a puzzle without recording or retrying it', () => {
    const q = new SessionQueue(['a', 'b']);
    q.skip();
    assert.equal(q.total, 2);
    q.next();
    q.complete(true);
    q.next();
    assert.ok(q.done);
    assert.deepEqual(q.stats(), { reviewed: 1, firstTry: 1, missed: 0, skipped: 1, retriesCleared: 0 });
  });

  it('tracks the position, and finish() ends it early keeping the results', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    assert.deepEqual([q.position, q.total], [1, 3]);
    q.complete(true);
    q.next();
    assert.equal(q.position, 2);
    q.finish();
    assert.ok(q.done);
    assert.equal(q.results.length, 1);
    q.next();
    q.complete(true);
    assert.equal(q.results.length, 1, 'nothing more happens after the end');
  });

  it('handles an empty session', () => {
    const q = new SessionQueue([]);
    assert.ok(q.done);
    assert.equal(q.current, null);
    assert.deepEqual(q.stats(), { reviewed: 0, firstTry: 0, missed: 0, skipped: 0, retriesCleared: 0 });
  });

  it('shuffles without losing or duplicating anything, deterministically per seed', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const a = shuffle(ids, seeded(1));
    assert.deepEqual([...a].sort(), [...ids].sort());
    assert.deepEqual(shuffle(ids, seeded(1)), a);
    assert.notDeepEqual(shuffle(ids, seeded(2)), a);
    assert.deepEqual(
      ids,
      Array.from({ length: 30 }, (_, i) => `p${i}`),
      'the input is not changed',
    );
  });

  it('picks at most SESSION_SIZE due puzzles', () => {
    const due = Array.from({ length: 55 }, (_, i) => `p${i}`);
    assert.equal(SESSION_SIZE, 20);
    const ids = pickSessionIds(due, seeded(3));
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    assert.ok(ids.every((id) => due.includes(id)));
    assert.equal(pickSessionIds(['x', 'y'], seeded(3)).length, 2);
    assert.deepEqual(pickSessionIds([]), []);
    assert.equal(pickSessionIds(due, seeded(3), 5).length, 5);
  });
});

describe('navigation stack', () => {
  it('pushes screens and goes back', () => {
    let s: nav.Stack<string> = nav.reset('home');
    s = nav.push(s, 'browse');
    s = nav.push(s, 'study');
    assert.equal(nav.current(s), 'study');
    s = nav.pop(s);
    assert.equal(nav.current(s), 'browse');
    s = nav.pop(s);
    assert.equal(nav.current(s), 'home');
    assert.equal(nav.canGoBack(s), false);
  });

  it('never pops the first screen (so Android back can exit the app from home)', () => {
    const s = nav.reset('home');
    assert.deepEqual(nav.pop(s), ['home']);
    assert.deepEqual(nav.popN(nav.push(s, 'a'), 5), ['home']);
  });

  it('replaces and resets', () => {
    assert.deepEqual(nav.replace(['home', 'session'], 'done'), ['home', 'done']);
    assert.deepEqual(nav.popN(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
    assert.deepEqual(nav.reset('x'), ['x']);
  });

  it('does not change the stack it is given', () => {
    const s = ['home', 'browse'] as const;
    nav.push(s, 'x');
    nav.pop(s);
    assert.deepEqual([...s], ['home', 'browse']);
  });
});

describe('learning mode: what Play does', () => {
  const day = localDay(new Date(2026, 10, 22));
  const id = 'p';

  it('starts a guided run until the guided stage is cleared', () => {
    const a = learningAction(emptyLearningState(), id, 6, day);
    assert.deepEqual([a.kind, a.label, a.enabled], ['guided', 'Play', true]);
    assert.match(a.caption, /Guided: stage 1 of 4 · 5 free moves/);
  });

  it('moves through the stages as clean runs are recorded', () => {
    let s = recordGuidedResult(emptyLearningState(), id, 6, true);
    assert.match(learningAction(s, id, 6, day).caption, /stage 2 of 4 · 3 free moves/);
    s = recordGuidedResult(recordGuidedResult(s, id, 6, true), id, 6, true);
    assert.match(learningAction(s, id, 6, day).caption, /stage 4 of 4 · 0 free moves/);
    assert.match(
      learningAction(recordGuidedResult(emptyLearningState(), id, 3, true), id, 3, day).caption,
      /1 free move\b/,
    );
  });

  it('starts a timed run once guided is cleared', () => {
    const s = recordGuidedResult(emptyLearningState(), id, 1, true);
    const a = learningAction(s, id, 1, day);
    assert.deepEqual([a.kind, a.enabled], ['learning', true]);
    assert.match(a.caption, /ready for timed runs/);
  });

  it('shows the best timed score once there is one', () => {
    let s = recordGuidedResult(emptyLearningState(), id, 1, true);
    s = recordTimedResult(s, id, { score: 12.4, level: 'gold', moves: 3, mistakes: 0, ms: 14500, lines: 1, at: 1 });
    assert.match(learningAction(s, id, 1, day).caption, /Best: gold · 12\.4/);
  });

  it('is unavailable after two attempts today, and available again tomorrow', () => {
    let s = recordGuidedResult(emptyLearningState(), id, 1, true);
    s = recordAttemptStart(recordAttemptStart(s, id, day), id, day);
    assert.equal(attemptsLeft(s, id, day), 0);
    const a = learningAction(s, id, 1, day);
    assert.deepEqual([a.kind, a.label, a.enabled], [null, 'Tomorrow', false]);
    assert.match(a.caption, /no attempts left today/);
    assert.equal(learningAction(s, id, 1, localDay(new Date(2026, 10, 23))).enabled, true);
  });

  it('is unavailable for a puzzle with no solution line', () => {
    const a = learningAction(emptyLearningState(), id, 0, day);
    assert.deepEqual([a.kind, a.enabled], [null, false]);
  });
});

describe('pruning: which puzzles look too easy', () => {
  const at = Date.now();
  const clean = (n: number): Attempt[] =>
    Array.from({ length: n }, () => ({ correct: true, ms: 1000, parMs: 10000, at }));
  const bad: Attempt[] = [
    { correct: false, ms: 1000, parMs: 10000, at },
    { correct: false, ms: 1000, parMs: 10000, at },
  ];

  it('lists the best-known puzzles first: by skill level, then never-tried puzzles last', () => {
    const progress = { hard: bad, mid: clean(2), easy: clean(8) };
    assert.deepEqual(easiestFirst(['hard', 'mid', 'easy', 'new'], progress), ['easy', 'mid', 'hard', 'new']);
  });

  it('keeps ties in their original order', () => {
    assert.deepEqual(easiestFirst(['a', 'b', 'c'], {}), ['a', 'b', 'c']);
  });

  it('calls only gold and silver easy', () => {
    assert.deepEqual((['new', 'red', 'yellow', 'green', 'silver', 'gold'] as const).filter(isEasy), ['silver', 'gold']);
  });
});

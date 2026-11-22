import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLES } from '../src/data/samples';
import { StudyEngine } from '../src/study/engine';
import { validateSgf } from '../src/sgf/validate';
import { learnerDepth } from '../src/study/lines';
import { pt, solveByBook } from './helpers';

const stones = (e: StudyEngine, color: 'B' | 'W') => {
  let n = 0;
  for (let y = 0; y < e.dims.rows; y++)
    for (let x = 0; x < e.dims.cols; x++) if (e.snap.board.get({ x, y }) === color) n++;
  return n;
};

describe('built-in starter puzzles', () => {
  it('are all valid, uniquely identified and titled, and marked built-in', () => {
    assert.ok(SAMPLES.length >= 4);
    assert.equal(new Set(SAMPLES.map((s) => s.id)).size, SAMPLES.length);
    assert.equal(new Set(SAMPLES.map((s) => s.title)).size, SAMPLES.length);
    for (const s of SAMPLES) {
      assert.deepEqual(validateSgf(s.sgf).errors, [], s.title);
      assert.deepEqual(validateSgf(s.sgf).warnings, [], `${s.title} should not need warnings`);
      assert.equal(s.builtin, true);
    }
  });

  it('are really capture puzzles: playing the answer removes the opponent stones, and nothing else works', () => {
    for (const s of SAMPLES) {
      const e = new StudyEngine(s.sgf, 'unguided');
      const opp = e.playerColor === 'B' ? 'W' : 'B';
      const before = stones(e, opp);
      assert.ok(before > 0, `${s.title}: there is something to capture`);
      solveByBook(e);
      assert.equal(e.snap.status, 'solved');
      assert.equal(stones(e, opp), 0, `${s.title}: every opponent stone is captured by the answer`);
      assert.equal(e.mistakes, 0);
    }
  });

  it('every opponent group is in atari at the start (exactly one liberty), so the answer is forced', () => {
    for (const s of SAMPLES) {
      const e = new StudyEngine(s.sgf, 'unguided');
      const opp = e.playerColor;
      const empties: { x: number; y: number }[] = [];
      for (let y = 0; y < e.dims.rows; y++)
        for (let x = 0; x < e.dims.cols; x++) {
          const p = { x, y };
          const r = e.snap.board.play(p, opp);
          if (r && r.captured > 0) empties.push(p);
        }
      assert.equal(empties.length, 1, `${s.title}: exactly one capturing move exists`);
      // and it is the move in the book
      const book = e.bookMoves();
      assert.deepEqual(book, [empties[0]], s.title);
    }
  });

  it('wrong moves are rejected', () => {
    for (const s of SAMPLES) {
      const e = new StudyEngine(s.sgf, 'unguided');
      assert.equal(e.play(pt('ss')), 'wrong', s.title);
      assert.equal(e.mistakes, 1);
    }
  });

  it('all work in guided mastery: one-move puzzles clear the guided stage with a single clean run', () => {
    for (const s of SAMPLES) assert.equal(learnerDepth(s.sgf), 1, s.title);
  });
});

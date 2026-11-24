import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../../src/study/engine';
import { learnerDepth } from '../../src/study/lines';
import { BRANCHY, pt, seeded, solveByBook, validProblems, XXQJ1, LEARNER, finishReplay } from '../lib/helpers';
import { guidedStages } from '../../src/progress/learning';

describe('guided run: free moves played before the player starts', () => {
  it('plays the given number of moves and their replies, then hands over', () => {
    const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 3 });
    assert.equal(e.phase, 'replay');
    assert.equal(e.freeMovesPlayed, 3);
    finishReplay(e);
    assert.equal(e.phase, 'play');
    assert.equal(e.snap.toPlay, 'W', 'it is the learner’s turn');
    for (const m of LEARNER.slice(0, 3)) assert.equal(e.snap.board.get(pt(m)), 'W', `${m} was given`);
    assert.equal(e.snap.board.get(pt('jh')), 'B', 'including the opponent’s reply to the last free move');
    assert.equal(e.snap.board.get(pt(LEARNER[3])), null, 'the rest is up to the player');
    assert.equal(e.mistakes, 0, 'free moves are not mistakes');
  });

  it('the player solves the rest; a wrong move is a mistake', () => {
    const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 3 });
    finishReplay(e);
    assert.equal(e.play(pt('aa')), 'wrong');
    assert.equal(e.mistakes, 1);
    assert.equal(e.play(pt('ih')), 'ok');
    assert.equal(e.play(pt('hi')), 'ok');
    assert.equal(e.play(pt('hk')), 'solved');
  });

  it('leaves exactly one move at the maximum, however large the request', () => {
    for (const ask of [5, 6, 50]) {
      const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: ask });
      finishReplay(e);
      assert.equal(e.freeMovesPlayed, 5, `asked for ${ask}`);
      assert.equal(e.play(pt('hk')), 'solved');
    }
  });

  it('zero free moves is a plain solve, with nothing to watch', () => {
    const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 0 });
    assert.equal(e.phase, 'play');
    assert.equal(e.freeMovesPlayed, 0);
    assert.equal(e.snap.board.get(pt('jj')), null);
  });

  it('a single-move puzzle has nothing to give away', () => {
    const e = new StudyEngine('(;SZ[9]PL[B]AB[ba]AW[aa];B[ab]TE[1])', 'unguided', { freeMoves: 3 });
    assert.equal(e.phase, 'play');
    assert.equal(e.freeMovesPlayed, 0);
  });

  it('is not tracked as an ordinary unguided attempt', () => {
    assert.equal(new StudyEngine(XXQJ1(), 'unguided').tracksSkill, true);
    assert.equal(new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 2 }).tracksSkill, false);
    assert.equal(new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 0 }).tracksSkill, false);
  });

  it('follows a real line through a branching puzzle, whichever branch is picked', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const e = new StudyEngine(BRANCHY, 'unguided', { freeMoves: 1, rng: seeded(seed) });
      finishReplay(e);
      assert.equal(e.freeMovesPlayed, 1);
      seen.add(e.snap.board.get(pt('cc')) ? 'cc' : 'jj');
      solveByBook(e);
      assert.equal(e.mistakes, 0);
    }
    assert.deepEqual([...seen].sort(), ['cc', 'jj'], 'both first moves get picked over many runs');
  });

  it('every stage of every fixture puzzle hands over to a solvable position', () => {
    let runs = 0;
    for (const file of ['qjzm-a.sgf.gz', 'xxqj.sgf.gz', 'gzp1.sgf.gz']) {
      for (const sgf of validProblems(file)) {
        for (const free of guidedStages(learnerDepth(sgf))) {
          const e = new StudyEngine(sgf, 'unguided', { freeMoves: free, rng: seeded(runs + 1) });
          finishReplay(e);
          assert.ok(e.freeMovesPlayed <= free);
          solveByBook(e);
          assert.equal(e.mistakes, 0);
          runs++;
        }
      }
    }
    assert.ok(runs > 2000, `${runs} guided runs`);
  });
});

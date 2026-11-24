import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../../src/study/engine';
import { TimedRun } from '../../src/study/timed';
import { learnerDepth } from '../../src/study/lines';
import { XXQJ1, finishReplay, clock, playRun, solveByBook, pt } from '../lib/helpers';
import {
  attemptsLeft,
  emptyLearningState,
  guidedStatus,
  localDay,
  timedUnlocked,
  puzzleTimedLevel,
  recordAttemptStart,
  recordGuidedResult,
  recordTimedResult,
  setCategory,
} from '../../src/progress/learning';

describe('the whole journey: add, guided stages, unlock, learning', () => {
  const sgf = XXQJ1(); // 6 learner moves: guided stages 5, 3, 1, 0
  const day = (n: number) => localDay(new Date(2026, 10, 22 + n));

  it('takes four clean guided runs over two days, then unlocks learning', () => {
    let s = setCategory(emptyLearningState(), 'learning', 'p', true);
    const L = learnerDepth(sgf);
    const log: string[] = [];

    for (let d = 0; !guidedStatus(s, 'p', L).cleared; d++) {
      assert.ok(d < 5, 'did not finish');
      assert.equal(timedUnlocked(s, 'p'), false);
      for (let a = 0; attemptsLeft(s, 'p', day(d)) > 0 && !guidedStatus(s, 'p', L).cleared; a++) {
        s = recordAttemptStart(s, 'p', day(d));
        const free = guidedStatus(s, 'p', L).free;
        const e = new StudyEngine(sgf, 'unguided', { freeMoves: free });
        finishReplay(e);
        solveByBook(e);
        s = recordGuidedResult(s, 'p', L, e.mistakes === 0);
        log.push(`day${d}:${free}`);
      }
      assert.equal(attemptsLeft(s, 'p', day(d)), guidedStatus(s, 'p', L).cleared && log.length === 3 ? 1 : 0);
    }
    assert.deepEqual(log, ['day0:5', 'day0:3', 'day1:1', 'day1:0'], 'two attempts a day');
    assert.equal(timedUnlocked(s, 'p'), true);

    // a timed run, 12 moves/min -> gold
    const c = clock();
    const run = new TimedRun(sgf, { now: c.now });
    s = recordAttemptStart(s, 'p', day(2));
    playRun(run, c, 5000);
    s = recordTimedResult(s, 'p', run.result());
    assert.equal(run.result().moves, 6);
    assert.equal(puzzleTimedLevel(s, 'p'), 'gold');
    assert.equal(attemptsLeft(s, 'p', day(2)), 1);
  });

  it('a failed guided run costs the attempt but not the progress', () => {
    let s = setCategory(emptyLearningState(), 'learning', 'p', true);
    const L = learnerDepth(sgf);
    s = recordAttemptStart(s, 'p', day(0));
    const e = new StudyEngine(sgf, 'unguided', { freeMoves: guidedStatus(s, 'p', L).free });
    finishReplay(e);
    e.play(pt('aa'));
    solveByBook(e);
    s = recordGuidedResult(s, 'p', L, e.mistakes === 0);
    assert.equal(guidedStatus(s, 'p', L).free, 5, 'still at the first stage');
    assert.equal(attemptsLeft(s, 'p', day(0)), 1);
  });
});

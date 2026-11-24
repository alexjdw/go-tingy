import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DIAMOND_ABOVE,
  emptyLearningState,
  guidedStages,
  guidedStatus,
  initialFree,
  learningProgress,
  recordGuidedResult,
  recordTimedResult,
} from '../../src/progress/learning';
import { type Attempt, attemptScore, computeSkill, worseRating } from '../../src/progress/skill';
import { SessionQueue } from '../../src/study/session';
import { DEFAULT_SETTINGS } from '../../src/storage/settings';
import { rollTri } from '../../src/study/engine';

const L = 6; // guided stages 5, 3, 1, 0 in steps of 2 (see freeStep)
const paperAttempt = (self: Attempt['self']): Attempt => ({
  correct: self !== 'toohard',
  ms: 90_000,
  parMs: 10_000,
  at: 0,
  self,
});

describe('paper mode: spaced repetition', () => {
  it('scores an attempt by the self-rating, whatever the time', () => {
    assert.equal(attemptScore(paperAttempt('easy')), 1);
    assert.ok(attemptScore(paperAttempt('medium')) > attemptScore(paperAttempt('tough')));
    assert.equal(attemptScore(paperAttempt('toohard')), 0);
  });

  it('easy ratings build a gold puzzle, too tough ones a red one', () => {
    assert.equal(computeSkill(Array(6).fill(paperAttempt('easy'))).level, 'gold');
    assert.equal(computeSkill(Array(3).fill(paperAttempt('toohard'))).level, 'red');
  });

  it('a too tough answer brings the puzzle back once in the session', () => {
    const q = new SessionQueue(['a']);
    q.complete(paperAttempt('toohard').correct);
    assert.equal(q.total, 2);
    const ok = new SessionQueue(['a']);
    ok.complete(paperAttempt('tough').correct);
    assert.equal(ok.total, 1);
  });

  it('keeps the worse of two ratings (the two sides of a joseki)', () => {
    assert.equal(worseRating('easy', 'tough'), 'tough');
    assert.equal(worseRating('toohard', 'easy'), 'toohard');
    assert.equal(worseRating(undefined, 'medium'), 'medium');
    assert.equal(worseRating(undefined, undefined), undefined);
  });
});

describe('paper mode: guided learning', () => {
  it('steps the free moves down for any rating but too tough', () => {
    for (const r of ['easy', 'medium', 'tough'] as const) {
      const s = recordGuidedResult(emptyLearningState(), 'p', L, true, r);
      assert.equal(guidedStatus(s, 'p', L).free, guidedStages(L)[1], r);
    }
  });

  it('adds free moves back when it was too tough, up to the starting count', () => {
    let s = recordGuidedResult(emptyLearningState(), 'p', L, true, 'easy');
    s = recordGuidedResult(s, 'p', L, true, 'easy');
    const before = guidedStatus(s, 'p', L).free;
    s = recordGuidedResult(s, 'p', L, false, 'toohard');
    assert.ok(guidedStatus(s, 'p', L).free > before);
    for (let i = 0; i < 10; i++) s = recordGuidedResult(s, 'p', L, false, 'toohard');
    assert.equal(guidedStatus(s, 'p', L).free, initialFree(L));
    assert.equal(guidedStatus(s, 'p', L).cleared, false);
  });

  it('too tough at zero free moves does not clear the stage and adds moves back', () => {
    let s = emptyLearningState();
    while (guidedStatus(s, 'p', L).free > 0) s = recordGuidedResult(s, 'p', L, true, 'easy');
    s = recordGuidedResult(s, 'p', L, false, 'toohard');
    const g = guidedStatus(s, 'p', L);
    assert.equal(g.cleared, false);
    assert.ok(g.free > 0);
  });

  it('a better self-rating at zero free moves gives a higher guided score', () => {
    const cleared = (r: 'easy' | 'medium' | 'tough') => {
      let s = emptyLearningState();
      while (!guidedStatus(s, 'p', L).cleared) s = recordGuidedResult(s, 'p', L, true, r);
      return learningProgress(s, 'p', L).fill;
    };
    assert.equal(cleared('easy'), 0.5);
    assert.ok(cleared('medium') < cleared('easy'));
    assert.ok(cleared('tough') < cleared('medium'));
    assert.ok(cleared('tough') >= 0.25);
  });

  it('a clean run without a rating still gives the full guided half', () => {
    let s = emptyLearningState();
    while (!guidedStatus(s, 'p', L).cleared) s = recordGuidedResult(s, 'p', L, true);
    assert.equal(learningProgress(s, 'p', L).fill, 0.5);
  });

  it('timed runs can still fill the bar after a lower self-rating', () => {
    let s = emptyLearningState();
    while (!guidedStatus(s, 'p', L).cleared) s = recordGuidedResult(s, 'p', L, true, 'tough');
    s = recordTimedResult(s, 'p', {
      score: DIAMOND_ABOVE + 1,
      level: 'diamond',
      moves: 10,
      mistakes: 0,
      ms: 1000,
      lines: 1,
      at: 0,
    });
    assert.equal(learningProgress(s, 'p', L).fill, 1);
  });

  it('a mistake without a rating still changes nothing', () => {
    const s = emptyLearningState();
    assert.equal(recordGuidedResult(s, 'p', L, false), s);
  });
});

describe('paper mode setting', () => {
  it('is off by default and follows the on / random / off setting', () => {
    assert.equal(DEFAULT_SETTINGS.paper, 'off');
    assert.equal(rollTri('on'), true);
    assert.equal(rollTri('off'), false);
    assert.equal(
      rollTri('random', () => 0.2),
      true,
    );
    assert.equal(
      rollTri('random', () => 0.8),
      false,
    );
  });
});

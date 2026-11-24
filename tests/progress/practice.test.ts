import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { easiestFirst, isEasy, learningAction } from '../../src/progress/practice';
import {
  attemptsLeft,
  emptyLearningState,
  localDay,
  recordAttemptStart,
  recordGuidedResult,
  recordTimedResult,
} from '../../src/progress/learning';
import type { Attempt } from '../../src/progress/skill';

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

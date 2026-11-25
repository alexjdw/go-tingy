import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_MS,
  backlogCandidates,
  clampWhole,
  graduateToSpaced,
  isPriority,
  priorityDaysLeft,
  priorityFirst,
  seedMastery,
  setPriority,
} from '../../src/progress/backlog';
import { emptyLearningState, inCategory, parseLearningState, setCategory } from '../../src/progress/learning';
import { computeSkill, isDue, type Attempt } from '../../src/progress/skill';

const NOW = 1_000_000_000_000;
const good = (at: number): Attempt => ({ correct: true, ms: 1000, parMs: 1000, at });
const bad = (at: number): Attempt => ({ correct: false, ms: 9000, parMs: 1000, at });

describe('priority', () => {
  it('lasts the chosen number of days and then ends', () => {
    const s = setPriority(emptyLearningState(), ['a'], 3, NOW);
    assert.equal(isPriority(s, 'a', NOW + 2.5 * DAY_MS), true);
    assert.equal(isPriority(s, 'a', NOW + 3 * DAY_MS), false);
    assert.equal(isPriority(s, 'b', NOW), false);
    assert.equal(priorityDaysLeft(s, 'a', NOW), 3);
    assert.equal(priorityDaysLeft(s, 'a', NOW + 2.5 * DAY_MS), 1);
    assert.equal(priorityDaysLeft(s, 'a', NOW + 4 * DAY_MS), 0);
  });

  it('drops ended priorities when new ones are set, and keeps running ones', () => {
    let s = setPriority(emptyLearningState(), ['old'], 1, NOW);
    s = setPriority(s, ['mid'], 10, NOW);
    s = setPriority(s, ['new'], 5, NOW + 2 * DAY_MS);
    assert.deepEqual(Object.keys(s.priority!).sort(), ['mid', 'new']);
  });

  it('puts priority puzzles first and keeps the order inside each group', () => {
    const s = setPriority(emptyLearningState(), ['c', 'e'], 2, NOW);
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    assert.deepEqual(
      priorityFirst(items, s, NOW).map((p) => p.id),
      ['c', 'e', 'a', 'b', 'd'],
    );
    assert.deepEqual(
      priorityFirst(items, emptyLearningState(), NOW).map((p) => p.id),
      ['a', 'b', 'c', 'd', 'e'],
    );
  });

  it('survives being saved and loaded', () => {
    const s = setPriority(emptyLearningState(), ['a'], 2, NOW);
    assert.deepEqual(parseLearningState(JSON.parse(JSON.stringify(s)))?.priority, s.priority);
    assert.equal(parseLearningState(JSON.parse(JSON.stringify(emptyLearningState())))?.priority, undefined);
  });
});

describe('choosing the backlog', () => {
  it('lists puzzles in spaced repetition or guided learning, lowest score first, without priorities', () => {
    let s = emptyLearningState();
    for (const id of ['strong', 'weak', 'mid']) s = setCategory(s, 'spaced', id, true);
    s = setCategory(s, 'learning', 'fresh', true); // guided, nothing done yet: score 0
    s = setPriority(s, ['mid'], 5, NOW);
    const progress = {
      strong: [good(1), good(2), good(3), good(4), good(5)],
      weak: [bad(1), bad(2)],
      mid: [good(1)],
    };
    const all = ['strong', 'weak', 'mid', 'fresh', 'outside'].map((id) => ({ id, learnerMoves: 3 }));
    // weak and fresh are both 0 and keep library order; mid is a priority already; outside is in neither list
    assert.deepEqual(
      backlogCandidates(all, s, progress, NOW).map((c) => c.id),
      ['weak', 'fresh', 'strong'],
    );
  });

  it('averages the guided and spaced scores of a puzzle that is in both', () => {
    let s = setCategory(setCategory(emptyLearningState(), 'learning', 'both', true), 'spaced', 'both', true);
    s = setCategory(s, 'spaced', 'half', true);
    const progress = { both: [good(1), good(2), good(3)], half: [good(1), good(2), good(3)] };
    const all = ['both', 'half'].map((id) => ({ id, learnerMoves: 3 }));
    // 'both' averages a high spaced score with a guided score of 0, so it ranks below 'half'
    assert.deepEqual(
      backlogCandidates(all, s, progress, NOW).map((c) => c.id),
      ['both', 'half'],
    );
  });
});

describe('moving a diamond puzzle to spaced repetition', () => {
  it('adds it to spaced repetition with a high score and takes it out of guided learning', () => {
    let s = setCategory(emptyLearningState(), 'learning', 'a', true);
    s = { ...s, scores: { a: { runs: 3 } } };
    const g = graduateToSpaced(s, { a: [bad(NOW - 5000)] }, 'a', NOW);
    assert.equal(inCategory(g.learning, 'learning', 'a'), false);
    assert.equal(inCategory(g.learning, 'spaced', 'a'), true);
    assert.deepEqual(g.learning.scores, s.scores, 'its guided scores are kept');
    assert.equal(computeSkill(g.progress.a).level, 'gold');
    assert.equal(isDue(g.progress.a, NOW + 10 * DAY_MS), false, 'not due for weeks');
    assert.equal(isDue(g.progress.a, NOW + 22 * DAY_MS), true);
  });

  it('leaves the spaced history alone when the puzzle is already in spaced repetition', () => {
    const s = setCategory(setCategory(emptyLearningState(), 'learning', 'a', true), 'spaced', 'a', true);
    const progress = { a: [bad(1)] };
    const g = graduateToSpaced(s, progress, 'a', NOW);
    assert.equal(g.progress, progress);
    assert.equal(inCategory(g.learning, 'learning', 'a'), false);
    assert.equal(inCategory(g.learning, 'spaced', 'a'), true);
  });

  it('keeps at most 50 attempts', () => {
    const many = Array.from({ length: 50 }, (_, i) => bad(i));
    assert.equal(seedMastery({ a: many }, 'a', NOW).a.length, 50);
  });
});

describe('the numbers in the settings', () => {
  it('are whole numbers kept in range', () => {
    assert.equal(clampWhole('12', 1, 100, 5), 12);
    assert.equal(clampWhole('0', 1, 100, 5), 1);
    assert.equal(clampWhole('5000', 1, 100, 5), 100);
    assert.equal(clampWhole('', 1, 100, 5), 5);
    assert.equal(clampWhole('abc', 1, 100, 5), 5);
    assert.equal(clampWhole(7.9, 1, 100, 5), 7);
  });
});

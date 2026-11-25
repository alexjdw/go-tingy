import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type LearningState,
  type TimedResult,
  emptyLearningState,
  recordAttemptStart,
  recordTimedResult,
  setCategory,
  skillMark,
} from '../../src/progress/learning';
import { nextAutoIndex, pickAutoIds } from '../../src/study/auto';
import { seeded } from '../lib/helpers';

const DAY = '2026-11-25';
const timed = (level: TimedResult['level'], score: number): TimedResult => ({
  score,
  level,
  moves: 5,
  mistakes: 0,
  ms: 1000,
  lines: 1,
  at: 1,
});

/** puzzles of 4 learner moves each, one or two at every level */
function world() {
  let s: LearningState = emptyLearningState();
  const ids = ['r1', 'r2', 'y1', 'g1', 'g2', 's1', 'd1'];
  for (const id of ids) s = setCategory(s, 'learning', id, true);
  const guided = (id: string, free: number, cleared = false) => {
    s = { ...s, scores: { ...s.scores, [id]: { ...s.scores[id], guided: { free, cleared } } } };
  };
  guided('y1', 1); // far enough along for yellow
  for (const id of ['g1', 'g2', 's1', 'd1']) guided(id, 0, true);
  s = recordTimedResult(s, 's1', timed('gold', 12));
  s = recordTimedResult(s, 'd1', timed('diamond', 20));
  const items = ids.map((id) => ({ id, learnerMoves: 4 }));
  return { s, items };
}

describe('auto mode', () => {
  it('has the marks the test world assumes', () => {
    const { s } = world();
    assert.deepEqual(
      ['r1', 'y1', 'g1', 's1', 'd1'].map((id) => skillMark(s, id, 4)),
      ['red', 'yellow', 'green', 'sparkle', 'diamond'],
    );
  });

  it('picks the lowest levels first, at random inside a level, and never a diamond puzzle', () => {
    const { s, items } = world();
    for (let seed = 1; seed < 20; seed++) {
      const ids = pickAutoIds(items, s, DAY, 4, seeded(seed));
      assert.deepEqual([...ids.slice(0, 2)].sort(), ['r1', 'r2'], 'both red puzzles first');
      assert.equal(ids[2], 'y1');
      assert.ok(['g1', 'g2'].includes(ids[3]));
    }
    const all = pickAutoIds(items, s, DAY, 100, seeded(1));
    assert.equal(all.length, 6);
    assert.ok(!all.includes('d1'));
    assert.equal(all[all.length - 1], 's1');
  });

  it('really varies the order inside a level', () => {
    const { s, items } = world();
    const firsts = new Set(Array.from({ length: 30 }, (_, i) => pickAutoIds(items, s, DAY, 1, seeded(i + 1))[0]));
    assert.deepEqual([...firsts].sort(), ['r1', 'r2']);
  });

  it('skips puzzles that have no attempts left today or no line to solve', () => {
    const w = world();
    const s = recordAttemptStart(recordAttemptStart(w.s, 'r1', DAY), 'r1', DAY);
    const items = w.items.map((it) => (it.id === 'r2' ? { ...it, learnerMoves: 0 } : it));
    const ids = pickAutoIds(items, s, DAY, 10, seeded(1));
    assert.ok(!ids.includes('r1'));
    assert.ok(!ids.includes('r2'));
    assert.equal(ids[0], 'y1');
  });

  it('moves on to the next puzzle only once the current one has no attempts left', () => {
    const { s: s0, items } = world();
    const byId = new Map(items.map((it) => [it.id, it]));
    const plan = { ids: ['r1', 'y1', 'g1'] };
    assert.equal(nextAutoIndex(plan, 0, s0, byId, DAY), 0);
    const one = recordAttemptStart(s0, 'r1', DAY);
    assert.equal(nextAutoIndex(plan, 0, one, byId, DAY), 0, 'one attempt left: stay on it');
    const two = recordAttemptStart(one, 'r1', DAY);
    assert.equal(nextAutoIndex(plan, 0, two, byId, DAY), 1, 'both used: next puzzle');
    const all = ['y1', 'g1'].reduce((s, id) => recordAttemptStart(recordAttemptStart(s, id, DAY), id, DAY), two);
    assert.equal(nextAutoIndex(plan, 0, all, byId, DAY), null, 'everything used up: done');
  });
});

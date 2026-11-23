import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Attempt } from '../src/progress/skill';
import {
  DAILY_LIMIT,
  MAX_BACKUPS,
  type TimedResult,
  type LearningState,
  attemptsLeft,
  attemptsToday,
  chooseStartupState,
  emptyLearningState,
  freeStep,
  guidedStages,
  guidedStatus,
  inCategory,
  initialFree,
  isDueNow,
  localDay,
  timedLevel,
  timedScore,
  timedUnlocked,
  parseBackups,
  parseLearningState,
  pushBackup,
  puzzleTimedLevel,
  recordAttemptStart,
  recordGuidedResult,
  recordTimedResult,
  setCategory,
  visibleIds,
} from '../src/progress/learning';
import { createLearningStore, type KeyValue, BACKUPS_KEY, STATE_KEY } from '../src/storage/learning';
import { enumerateLines, isUnder, learnerDepth, linesOf, nodeKey } from '../src/study/lines';
import { boardDims, firstMoveColor, parseSgf } from '../src/sgf/parser';
import { fixtureProblem } from './helpers';

export const BRANCHY =
  '(;SZ[19]PL[B]AB[aa]AW[ab](;B[cc](;W[dd];B[ee]TE[1])(;W[ff];B[gg]TE[1]))(;B[jj];W[kk];B[ll]TE[1])(;B[mm]BM[1]))';

const result = (over: Partial<TimedResult> = {}): TimedResult => ({
  score: 7,
  level: 'green',
  moves: 7,
  mistakes: 0,
  ms: 60000,
  lines: 1,
  at: 1,
  ...over,
});

describe('categories: spaced repetition and guided learning', () => {
  it('adds and removes puzzles, idempotently and without mutating the old state', () => {
    const s0 = emptyLearningState();
    const s1 = setCategory(s0, 'spaced', 'a', true);
    assert.equal(inCategory(s1, 'spaced', 'a'), true);
    assert.equal(inCategory(s0, 'spaced', 'a'), false, 'original untouched');
    assert.equal(setCategory(s1, 'spaced', 'a', true), s1, 'adding twice is a no-op');
    assert.equal(inCategory(setCategory(s1, 'spaced', 'a', false), 'spaced', 'a'), false);
    assert.equal(setCategory(s0, 'learning', 'a', false), s0, 'removing something absent is a no-op');
  });

  it('the two categories are independent', () => {
    const s = setCategory(emptyLearningState(), 'learning', 'a', true);
    assert.equal(inCategory(s, 'learning', 'a'), true);
    assert.equal(inCategory(s, 'spaced', 'a'), false);
  });

  it('removing keeps the puzzle’s scores, so adding it back resumes', () => {
    let s = setCategory(emptyLearningState(), 'learning', 'a', true);
    s = recordGuidedResult(s, 'a', 6, true);
    s = setCategory(s, 'learning', 'a', false);
    s = setCategory(s, 'learning', 'a', true);
    assert.equal(guidedStatus(s, 'a', 6).free, 3);
  });

  const now = 10_000_000_000;
  const attempt = (correct: boolean, at = now): Attempt => ({ correct, ms: 1000, parMs: 1000, at });

  it('only spaced-repetition puzzles ever come due', () => {
    let s = emptyLearningState();
    assert.equal(isDueNow(s, 'a', undefined, now), false, 'never added: not due, even with no history');
    assert.equal(isDueNow(s, 'a', [attempt(false)], now), false, 'history alone does not make it due');
    s = setCategory(s, 'spaced', 'a', true);
    assert.equal(isDueNow(s, 'a', undefined, now), true, 'added and never practiced: due');
    assert.equal(isDueNow(s, 'a', [attempt(false), attempt(false)], now), true, 'failing: due again at once');
    const gold = Array.from({ length: 5 }, () => attempt(true));
    assert.equal(isDueNow(s, 'a', gold, now), false, 'mastered and just practiced: not due');
    assert.equal(isDueNow(s, 'a', gold, now + 22 * 86_400_000), true, 'due again after the gold interval');
    s = setCategory(s, 'spaced', 'a', false);
    assert.equal(isDueNow(s, 'a', undefined, now), false, 'removed: no longer due');
  });

  it('filters the library by category and due-ness', () => {
    let s = emptyLearningState();
    s = setCategory(s, 'spaced', 'a', true);
    s = setCategory(s, 'spaced', 'b', true);
    s = setCategory(s, 'learning', 'b', true);
    s = setCategory(s, 'learning', 'c', true);
    const progress = { b: Array.from({ length: 5 }, () => attempt(true)) };
    const ids = ['a', 'b', 'c', 'd'];
    assert.deepEqual(visibleIds(ids, 'all', s, progress, now), ids);
    assert.deepEqual(visibleIds(ids, 'spaced', s, progress, now), ['a', 'b']);
    assert.deepEqual(visibleIds(ids, 'learning', s, progress, now), ['b', 'c']);
    assert.deepEqual(
      visibleIds(ids, 'due', s, progress, now),
      ['a'],
      'b is mastered, c and d are not in spaced repetition',
    );
  });
});

describe('guided stage: free moves step down to zero', () => {
  it('starts with all but the last move and steps down by length', () => {
    assert.equal(initialFree(6), 5);
    assert.equal(initialFree(1), 0);
    assert.equal(initialFree(0), 0);
    assert.equal(freeStep(1), 1);
    assert.equal(freeStep(5), 1);
    assert.equal(freeStep(6), 2);
    assert.equal(freeStep(10), 2);
    assert.equal(freeStep(11), 3);
  });

  it('lists the stages a puzzle goes through, ending at 0', () => {
    assert.deepEqual(guidedStages(0), [0]);
    assert.deepEqual(guidedStages(1), [0]);
    assert.deepEqual(guidedStages(2), [1, 0]);
    assert.deepEqual(guidedStages(3), [2, 1, 0]);
    assert.deepEqual(guidedStages(6), [5, 3, 1, 0]);
    assert.deepEqual(guidedStages(10), [9, 7, 5, 3, 1, 0]);
    assert.deepEqual(guidedStages(11), [10, 7, 4, 1, 0]);
    for (const L of [1, 4, 7, 13, 25, 40]) assert.ok(guidedStages(L).length <= 8, `${L} moves needs few stages`);
  });

  it('a clean run reduces the free moves; a run with a mistake changes nothing', () => {
    let s = emptyLearningState();
    assert.deepEqual(guidedStatus(s, 'a', 6), { free: 5, cleared: false });
    s = recordGuidedResult(s, 'a', 6, false);
    assert.deepEqual(guidedStatus(s, 'a', 6), { free: 5, cleared: false }, 'a failed run is not progress');
    s = recordGuidedResult(s, 'a', 6, true);
    assert.deepEqual(guidedStatus(s, 'a', 6), { free: 3, cleared: false });
    s = recordGuidedResult(s, 'a', 6, false);
    assert.equal(guidedStatus(s, 'a', 6).free, 3);
  });

  it('clearing needs a clean run with zero free moves', () => {
    let s = emptyLearningState();
    const seen: number[] = [];
    for (let i = 0; i < 10 && !guidedStatus(s, 'a', 6).cleared; i++) {
      seen.push(guidedStatus(s, 'a', 6).free);
      assert.equal(timedUnlocked(s, 'a'), false, 'locked until cleared');
      s = recordGuidedResult(s, 'a', 6, true);
    }
    assert.deepEqual(seen, [5, 3, 1, 0], 'the last run is the one at 0 free moves');
    assert.equal(guidedStatus(s, 'a', 6).cleared, true);
    assert.equal(timedUnlocked(s, 'a'), true);
    assert.equal(recordGuidedResult(s, 'a', 6, true), s, 'nothing more to do once cleared');
  });

  it('a one-move puzzle clears with a single clean run', () => {
    const s = recordGuidedResult(emptyLearningState(), 'a', 1, true);
    assert.equal(timedUnlocked(s, 'a'), true);
  });

  it('puzzles progress independently', () => {
    let s = recordGuidedResult(emptyLearningState(), 'a', 6, true);
    s = recordGuidedResult(s, 'b', 3, true);
    assert.equal(guidedStatus(s, 'a', 6).free, 3);
    assert.equal(guidedStatus(s, 'b', 3).free, 1);
    assert.equal(guidedStatus(s, 'c', 6).free, 5);
  });

  it('stale progress is clamped if the puzzle got shorter', () => {
    const s = recordGuidedResult(emptyLearningState(), 'a', 10, true); // free 9 -> 7
    assert.equal(guidedStatus(s, 'a', 4).free, 3);
  });
});

describe('timed score and levels', () => {
  it('is correct moves per minute', () => {
    assert.equal(timedScore({ moves: 6, ms: 60000, mistakes: 0 }), 6);
    assert.equal(timedScore({ moves: 6, ms: 30000, mistakes: 0 }), 12);
    assert.equal(timedScore({ moves: 3, ms: 90000, mistakes: 0 }), 2);
  });

  it('halves for every mistake', () => {
    assert.equal(timedScore({ moves: 12, ms: 60000, mistakes: 1 }), 6);
    assert.equal(timedScore({ moves: 12, ms: 60000, mistakes: 2 }), 3);
    assert.equal(timedScore({ moves: 12, ms: 60000, mistakes: 3 }), 1.5);
  });

  it('is 0 without time or moves', () => {
    assert.equal(timedScore({ moves: 5, ms: 0, mistakes: 0 }), 0);
    assert.equal(timedScore({ moves: 0, ms: 5000, mistakes: 0 }), 0);
  });

  it('levels are strictly above 5, 10 and 15', () => {
    const at = (n: number) => timedLevel(n);
    assert.deepEqual([at(0), at(4.99), at(5)], ['none', 'none', 'none']);
    assert.deepEqual([at(5.0001), at(7), at(10)], ['green', 'green', 'green']);
    assert.deepEqual([at(10.0001), at(12), at(15)], ['gold', 'gold', 'gold']);
    assert.deepEqual([at(15.0001), at(40)], ['diamond', 'diamond']);
  });

  it('a mistake can drop a run a whole level', () => {
    assert.equal(timedLevel(timedScore({ moves: 12, ms: 60000, mistakes: 0 })), 'gold');
    assert.equal(timedLevel(timedScore({ moves: 12, ms: 60000, mistakes: 1 })), 'green');
    assert.equal(timedLevel(timedScore({ moves: 12, ms: 60000, mistakes: 2 })), 'none');
  });

  it('keeps the best run for the level, and the latest run separately', () => {
    let s = emptyLearningState();
    assert.equal(puzzleTimedLevel(s, 'a'), 'none');
    s = recordTimedResult(s, 'a', result({ score: 12, level: 'gold' }));
    s = recordTimedResult(s, 'a', result({ score: 7, level: 'green', at: 2 }));
    assert.equal(s.scores.a.best?.score, 12, 'a worse run does not lower the best');
    assert.equal(s.scores.a.last?.score, 7);
    assert.equal(s.scores.a.runs, 2);
    assert.equal(puzzleTimedLevel(s, 'a'), 'gold');
    s = recordTimedResult(s, 'a', result({ score: 16, level: 'diamond', at: 3 }));
    assert.equal(puzzleTimedLevel(s, 'a'), 'diamond');
  });

  it('recording a learning result keeps the guided progress', () => {
    let s = recordGuidedResult(emptyLearningState(), 'a', 1, true);
    s = recordTimedResult(s, 'a', result());
    assert.equal(timedUnlocked(s, 'a'), true);
  });
});

describe('two attempts per day', () => {
  const day1 = localDay(new Date(2026, 10, 22, 9, 0));

  it('formats the local calendar day', () => {
    assert.equal(day1, '2026-11-22');
    assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(localDay(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  });

  it('allows exactly two and then none', () => {
    assert.equal(DAILY_LIMIT, 2);
    let s = emptyLearningState();
    assert.equal(attemptsLeft(s, 'a', day1), 2);
    s = recordAttemptStart(s, 'a', day1);
    assert.equal(attemptsLeft(s, 'a', day1), 1);
    s = recordAttemptStart(s, 'a', day1);
    assert.equal(attemptsLeft(s, 'a', day1), 0);
    s = recordAttemptStart(s, 'a', day1);
    assert.equal(attemptsLeft(s, 'a', day1), 0, 'never negative');
  });

  it('resets the next day, including across month and year boundaries', () => {
    let s = recordAttemptStart(recordAttemptStart(emptyLearningState(), 'a', day1), 'a', day1);
    assert.equal(attemptsLeft(s, 'a', '2026-11-23'), 2);
    assert.equal(attemptsLeft(s, 'a', localDay(new Date(2026, 11, 1))), 2);
    s = recordAttemptStart(recordAttemptStart(s, 'a', '2026-12-31'), 'a', '2026-12-31');
    assert.equal(attemptsLeft(s, 'a', '2026-12-31'), 0);
    assert.equal(attemptsLeft(s, 'a', localDay(new Date(2027, 0, 1))), 2);
  });

  it('is counted per puzzle', () => {
    let s = recordAttemptStart(recordAttemptStart(emptyLearningState(), 'a', day1), 'a', day1);
    s = recordAttemptStart(s, 'b', day1);
    assert.deepEqual([attemptsLeft(s, 'a', day1), attemptsLeft(s, 'b', day1), attemptsLeft(s, 'c', day1)], [0, 1, 2]);
    assert.equal(attemptsToday(s, 'a', day1), 2);
  });

  it('starting a new day starts the count over (not carried from yesterday)', () => {
    const s = recordAttemptStart(recordAttemptStart(emptyLearningState(), 'a', day1), 'a', day1);
    const next = recordAttemptStart(s, 'a', '2026-11-23');
    assert.equal(attemptsToday(next, 'a', '2026-11-23'), 1);
  });
});

describe('puzzle lines', () => {
  it('counts the lines of a branching puzzle and ignores wrong branches', () => {
    const l = linesOf(BRANCHY);
    assert.equal(l.leaves.length, 3);
    assert.deepEqual(l.leaves, ['B:cc;W:dd;B:ee', 'B:cc;W:ff;B:gg', 'B:jj;W:kk;B:ll']);
    assert.equal(l.maxLearnerMoves, 2);
    assert.equal(l.truncated, false);
  });

  it('measures real puzzles', () => {
    assert.equal(learnerDepth(fixtureProblem('xxqj.sgf.gz', 0)), 6);
    assert.equal(linesOf(fixtureProblem('xxqj.sgf.gz', 0)).leaves.length, 1);
    const q3 = linesOf(fixtureProblem('qjzm-a.sgf.gz', 2));
    assert.equal(q3.leaves.length, 2, 'the two triangle-marked refutations are not lines');
    assert.equal(q3.maxLearnerMoves, 3);
  });

  it('node keys are stable across separate parses, and isUnder follows the tree', () => {
    const a = parseSgf(BRANCHY);
    const b = parseSgf(BRANCHY);
    assert.equal(nodeKey(a), '');
    assert.equal(nodeKey(a.children[0].children[1]), nodeKey(b.children[0].children[1]));
    assert.equal(nodeKey(a.children[0].children[1]), 'B:cc;W:ff');
    assert.equal(isUnder('B:cc;W:ff;B:gg', 'B:cc'), true);
    assert.equal(isUnder('B:cc;W:ff;B:gg', ''), true);
    assert.equal(isUnder('B:cc;W:ff;B:gg', 'B:c'), false, 'a prefix of the text is not an ancestor');
    assert.equal(isUnder('B:jj;W:kk', 'B:cc'), false);
  });

  it('caps runaway trees', () => {
    const many = Array.from(
      { length: 250 },
      (_, i) => `(;B[${String.fromCharCode(97 + (i % 19))}${String.fromCharCode(97 + ((i / 19) | 0) + 2)}]TE[1])`,
    ).join('');
    const sgf = `(;SZ[19]PL[B]AB[aa]${many})`;
    const root = parseSgf(sgf);
    const set = enumerateLines(root, boardDims(root), firstMoveColor(root));
    assert.equal(set.leaves.length, 200);
    assert.equal(set.truncated, true);
  });
});

describe('persistence: validation and backups', () => {
  const state = (n: number): LearningState => setCategory(emptyLearningState(), 'learning', `p${n}`, true);

  it('accepts a valid state and fills in missing maps', () => {
    assert.deepEqual(parseLearningState(emptyLearningState()), emptyLearningState());
    assert.deepEqual(parseLearningState({ version: 1 }), emptyLearningState());
  });

  it('rejects things that are not a usable state', () => {
    for (const bad of [
      null,
      undefined,
      3,
      'x',
      [],
      { version: 2 },
      {},
      { version: 1, spaced: [] },
      { version: 1, scores: 4 },
    ]) {
      assert.equal(parseLearningState(bad), null, JSON.stringify(bad));
    }
  });

  it('keeps only the most recent 15 backups, oldest first', () => {
    assert.equal(MAX_BACKUPS, 15);
    let list: ReturnType<typeof pushBackup> = [];
    for (let i = 0; i < 20; i++) list = pushBackup(list, state(i), 1000 + i);
    assert.equal(list.length, 15);
    assert.deepEqual([list[0].at, list[14].at], [1005, 1019], 'the five oldest were dropped');
    assert.ok(inCategory(list[14].state, 'learning', 'p19'));
    assert.ok(!inCategory(list[0].state, 'learning', 'p4'), 'p4 is gone');
  });

  it('parses stored backups: sorted, invalid entries skipped', () => {
    const raw = [
      { at: 30, state: state(3) },
      { at: 10, state: state(1) },
      { at: 20, state: { version: 9 } },
      { state: state(4) },
      'junk',
      { at: 25, state: state(2) },
    ];
    assert.deepEqual(
      parseBackups(raw).map((b) => b.at),
      [10, 25, 30],
    );
    assert.deepEqual(parseBackups('nope'), []);
  });

  it('startup: a good saved state wins; otherwise the newest backup; otherwise empty', () => {
    const backups = [
      { at: 1, state: state(1) },
      { at: 2, state: state(2) },
    ];
    const primary = state(9);
    assert.deepEqual(chooseStartupState(primary, backups), { state: primary, source: 'primary' });
    for (const broken of [undefined, null, 'garbage', { version: 7 }]) {
      const r = chooseStartupState(broken, backups);
      assert.equal(r.source, 'backup');
      assert.ok(inCategory(r.state, 'learning', 'p2'), 'the newest backup');
    }
    assert.deepEqual(chooseStartupState(undefined, []), { state: emptyLearningState(), source: 'empty' });
  });
});

class MemoryKv implements KeyValue {
  data = new Map<string, string>();
  fail = false;
  async getItem(k: string) {
    if (this.fail) throw new Error('storage unavailable');
    return this.data.get(k) ?? null;
  }
  async setItem(k: string, v: string) {
    if (this.fail) throw new Error('storage unavailable');
    this.data.set(k, v);
  }
}

describe('the learning store (save, back up on exit, load on app start)', () => {
  let t = 5000;
  const make = () => {
    const kv = new MemoryKv();
    return { kv, store: createLearningStore(kv, () => ++t) };
  };
  const withScore = (n: number) =>
    recordGuidedResult(setCategory(emptyLearningState(), 'learning', 'a', true), 'a', 12, n > 0);

  it('starts empty on a fresh install', async () => {
    const { store } = make();
    assert.deepEqual(await store.load(), { state: emptyLearningState(), source: 'empty' });
  });

  it('saves and loads the state', async () => {
    const { store } = make();
    const s = withScore(1);
    await store.save(s);
    assert.deepEqual(await store.load(), { state: s, source: 'primary' });
  });

  it('keeps the most recent 15 backups over many exits', async () => {
    const { store, kv } = make();
    for (let i = 0; i < 22; i++) await store.backup(setCategory(emptyLearningState(), 'learning', `p${i}`, true));
    const list = await store.backups();
    assert.equal(list.length, 15);
    assert.ok(inCategory(list[14].state, 'learning', 'p21'));
    assert.ok(inCategory(list[0].state, 'learning', 'p7'));
    assert.equal(JSON.parse(kv.data.get(BACKUPS_KEY)!).length, 15);
  });

  it('on app load, a damaged saved state is recovered from the newest backup', async () => {
    const { store, kv } = make();
    const good = withScore(1);
    await store.save(good);
    await store.backup(good);
    kv.data.set(STATE_KEY, '{ this is not json');
    const r = await store.load();
    assert.equal(r.source, 'backup');
    assert.deepEqual(r.state, good);
  });

  it('a lost saved state is recovered too, picking the newest of several backups', async () => {
    const { store, kv } = make();
    await store.backup(setCategory(emptyLearningState(), 'spaced', 'old', true));
    await store.backup(setCategory(emptyLearningState(), 'spaced', 'new', true));
    kv.data.delete(STATE_KEY);
    const r = await store.load();
    assert.equal(r.source, 'backup');
    assert.ok(inCategory(r.state, 'spaced', 'new') && !inCategory(r.state, 'spaced', 'old'));
  });

  it('a damaged backup list does not break loading, and new backups still work', async () => {
    const { store, kv } = make();
    kv.data.set(BACKUPS_KEY, 'not json at all');
    const s = withScore(1);
    await store.save(s);
    assert.equal((await store.load()).source, 'primary');
    await store.backup(s);
    assert.equal((await store.backups()).length, 1);
  });

  it('unavailable storage reads as empty instead of crashing', async () => {
    const { store, kv } = make();
    kv.fail = true;
    assert.deepEqual(await store.load(), { state: emptyLearningState(), source: 'empty' });
  });
});

describe('learning badge fill', () => {
  it('rises with the level, from empty to full', async () => {
    const { levelFill } = await import('../src/progress/learning');
    const fills = (['none', 'green', 'gold', 'diamond'] as const).map(levelFill);
    assert.deepEqual(fills, [0, 1 / 3, 2 / 3, 1]);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_BACKUPS,
  type LearningState,
  chooseStartupState,
  emptyLearningState,
  inCategory,
  parseBackups,
  parseLearningState,
  pushBackup,
  recordGuidedResult,
  setCategory,
} from '../../src/progress/learning';
import { createLearningStore, type KeyValue, BACKUPS_KEY, STATE_KEY } from '../../src/storage/learning';

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

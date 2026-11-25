import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type Snapshot, mergeSnapshots, parseSnapshot, sameContent, stringifySnapshot } from '../../src/sync/snapshot';
import { type SyncProvider, SignInRequired, syncOnce } from '../../src/sync/engine';
import { DRIVE_SCOPE, SYNC_FILE_NAME, createDriveProvider } from '../../src/sync/drive';
import type { Attempt } from '../../src/progress/skill';

const SETTINGS = { markChoices: 'off', flipColors: 'random', paper: 'off', backlogCount: 5, backlogDays: 7 } as const;
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: 1,
  updatedAt: 1000,
  library: [],
  deleted: {},
  progress: {},
  joseki: [],
  learning: { version: 1, spaced: {}, learning: {}, scores: {}, attempts: {} },
  settings: { ...SETTINGS },
  ...over,
});
const puzzle = (id: string, sgf = '(;SZ[19])') => ({ id, title: id, sgf });
const attempt = (at: number, correct = true): Attempt => ({ correct, ms: 1000, parMs: 2000, at });

describe('merging two devices', () => {
  it('keeps the puzzles of both', () => {
    const m = mergeSnapshots(snap({ library: [puzzle('a')] }), snap({ library: [puzzle('b')] }));
    assert.deepEqual(m.library.map((p) => p.id).sort(), ['a', 'b']);
  });

  it('is the same whichever device merges first', () => {
    const a = snap({ updatedAt: 5, library: [puzzle('a')], progress: { a: [attempt(1)] }, joseki: ['a'] });
    const b = snap({ updatedAt: 9, library: [puzzle('b')], progress: { b: [attempt(2)] }, joseki: ['b'] });
    assert.ok(sameContent(mergeSnapshots(a, b), mergeSnapshots(b, a)));
  });

  it('keeps a deleted puzzle deleted, with its progress, on every device', () => {
    const a = snap({
      library: [puzzle('x')],
      progress: { x: [attempt(1)] },
      learning: { ...snap().learning, learning: { x: true } },
    });
    const b = snap({ updatedAt: 500, deleted: { x: 400 } });
    const m = mergeSnapshots(a, b);
    assert.equal(m.library.length, 0);
    assert.equal(m.progress.x, undefined);
    assert.equal(m.learning.learning.x, undefined);
    assert.equal(m.deleted.x, 400);
  });

  it('combines attempts once each and keeps the most recent 50', () => {
    const a = snap({ progress: { p: [attempt(1), attempt(2)] } });
    const b = snap({ progress: { p: [attempt(2), attempt(3)] } });
    assert.deepEqual(
      mergeSnapshots(a, b).progress.p.map((x) => x.at),
      [1, 2, 3],
    );
    const many = (from: number) => Array.from({ length: 40 }, (_, i) => attempt(from + i));
    const big = mergeSnapshots(snap({ progress: { p: many(0) } }), snap({ progress: { p: many(100) } }));
    assert.equal(big.progress.p.length, 50);
    assert.equal(big.progress.p.at(-1)!.at, 139);
  });

  it('the newer snapshot decides the settings, the joseki list and the learning lists', () => {
    const old = snap({ updatedAt: 1, joseki: ['a'], settings: { ...SETTINGS, paper: 'on' } });
    const fresh = snap({ updatedAt: 2, joseki: [], settings: { ...SETTINGS, paper: 'off' } });
    for (const m of [mergeSnapshots(old, fresh), mergeSnapshots(fresh, old)]) {
      assert.deepEqual(m.joseki, []);
      assert.equal(m.settings.paper, 'off');
      assert.equal(m.updatedAt, 2);
    }
  });

  it('keeps the priorities of both devices, the later end date winning, and drops those of deleted puzzles', () => {
    const l = (priority: Record<string, number>) => ({ ...snap().learning, priority });
    const a = snap({ updatedAt: 1, learning: l({ x: 100, y: 500, gone: 9 }) });
    const b = snap({ updatedAt: 2, learning: l({ x: 300, z: 7 }), deleted: { gone: 5 } });
    for (const m of [mergeSnapshots(a, b), mergeSnapshots(b, a)]) {
      assert.deepEqual(m.learning.priority, { x: 300, y: 500, z: 7 });
    }
    assert.equal('priority' in mergeSnapshots(snap(), snap()).learning, false, 'no priorities, no field');
    assert.equal(sameContent(a, snap({ updatedAt: 9, learning: l({ x: 100, y: 500, gone: 9 }) })), true);
    assert.equal(sameContent(a, snap({ learning: l({ x: 101, y: 500, gone: 9 }) })), false);
  });

  it('keeps the more practiced learning record, and the later day count', () => {
    const l = (runs: number, count: number, day: string) => ({
      ...snap().learning,
      scores: { p: { runs } },
      attempts: { p: { day, count } },
    });
    const m = mergeSnapshots(
      snap({ updatedAt: 9, learning: l(1, 1, '2026-01-02') }),
      snap({ learning: l(4, 3, '2026-01-01') }),
    );
    assert.equal(m.learning.scores.p.runs, 4);
    assert.deepEqual(m.learning.attempts.p, { day: '2026-01-02', count: 1 });
  });

  it('when both changed one puzzle, the newer snapshot keeps its version', () => {
    const m = mergeSnapshots(
      snap({ updatedAt: 1, library: [puzzle('a', 'old')] }),
      snap({ updatedAt: 2, library: [puzzle('a', 'new')] }),
    );
    assert.equal(m.library[0].sgf, 'new');
  });
});

describe('reading the cloud file', () => {
  it('round-trips', () => {
    const s = snap({ library: [puzzle('a')], progress: { a: [attempt(1)] } });
    assert.deepEqual(parseSnapshot(stringifySnapshot(s)), s);
  });
  it('rejects damaged, foreign and newer-version files', () => {
    assert.equal(parseSnapshot('not json'), null);
    assert.equal(parseSnapshot('[]'), null);
    assert.equal(parseSnapshot(JSON.stringify({ ...snap(), version: 2 })), null);
    assert.equal(parseSnapshot(JSON.stringify({ version: 1, updatedAt: 1 })), null);
  });
  it('drops puzzles that are not puzzles', () => {
    const bad = { ...snap(), library: [puzzle('a'), { id: 5 }, null] };
    assert.deepEqual(
      parseSnapshot(JSON.stringify(bad))!.library.map((p) => p.id),
      ['a'],
    );
  });
});

class Memory implements SyncProvider {
  writes = 0;
  constructor(public text: string | null = null) {}
  async read() {
    return this.text;
  }
  async write(t: string) {
    this.text = t;
    this.writes++;
  }
}

describe('one sync', () => {
  it('uploads the first time', async () => {
    const cloud = new Memory();
    const r = await syncOnce(cloud, snap({ library: [puzzle('a')] }));
    assert.equal(r.uploaded, true);
    assert.equal(parseSnapshot(cloud.text!)!.library.length, 1);
  });

  it('two devices end up with the same puzzles and progress', async () => {
    const cloud = new Memory();
    const a = snap({ updatedAt: 1, library: [puzzle('a')], progress: { a: [attempt(1)] } });
    const b = snap({ updatedAt: 2, library: [puzzle('b')], progress: { b: [attempt(2)] } });
    await syncOnce(cloud, a);
    const rb = await syncOnce(cloud, b);
    assert.equal(rb.changedLocal, true);
    const ra = await syncOnce(cloud, a);
    assert.ok(sameContent(ra.merged, rb.merged));
    assert.equal(ra.merged.library.length, 2);
  });

  it('does nothing when nothing changed', async () => {
    const cloud = new Memory();
    const s = snap({ library: [puzzle('a')] });
    await syncOnce(cloud, s);
    const again = await syncOnce(cloud, s);
    assert.equal(again.uploaded, false);
    assert.equal(again.changedLocal, false);
    assert.equal(cloud.writes, 1);
  });

  it('does not overwrite a damaged cloud file unless told to', async () => {
    const cloud = new Memory('{ half a file');
    const r = await syncOnce(cloud, snap());
    assert.equal(r.remoteDamaged, true);
    assert.equal(cloud.text, '{ half a file');
    const forced = await syncOnce(cloud, snap(), { replaceDamaged: true });
    assert.equal(forced.uploaded, true);
    assert.ok(parseSnapshot(cloud.text));
  });
});

describe('Google Drive', () => {
  type Call = { url: string; method: string; auth: string | null; body?: string };
  const fake = (files: { id: string; text: string }[], status = 200) => {
    const calls: Call[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      const h = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        auth: h.get('Authorization'),
        body: init.body as string | undefined,
      });
      if (status !== 200) return new Response('no', { status });
      if (url.includes('/files?spaces=appDataFolder'))
        return Response.json({ files: files.map((x) => ({ id: x.id })) });
      if (url.includes('alt=media')) return new Response(files[0].text);
      if (init.method === 'POST') return Response.json({ id: 'new-id' });
      return Response.json({});
    }) as typeof fetch;
    return { f, calls };
  };

  it('asks only for its own hidden folder', () => assert.match(DRIVE_SCOPE, /drive\.appdata$/));

  it('reads nothing when the file does not exist, then creates it in appDataFolder', async () => {
    const { f, calls } = fake([]);
    const drive = createDriveProvider({ getToken: async () => 'tok', fetch: f });
    assert.equal(await drive.read(), null);
    await drive.write('{"a":1}');
    const create = calls.at(-1)!;
    assert.equal(create.method, 'POST');
    assert.match(create.url, /uploadType=multipart/);
    assert.ok(create.body!.includes(`"parents":["appDataFolder"]`));
    assert.ok(create.body!.includes(SYNC_FILE_NAME));
    assert.ok(create.body!.includes('{"a":1}'));
    assert.ok(calls.every((c) => c.auth === 'Bearer tok'));
  });

  it('reads and updates the existing file in place', async () => {
    const { f, calls } = fake([{ id: 'f1', text: 'hello' }]);
    const drive = createDriveProvider({ getToken: async () => 'tok', fetch: f });
    assert.equal(await drive.read(), 'hello');
    await drive.write('bye');
    const upd = calls.at(-1)!;
    assert.equal(upd.method, 'PATCH');
    assert.match(upd.url, /files\/f1\?uploadType=media/);
    assert.equal(upd.body, 'bye');
    assert.equal(calls.filter((c) => c.url.includes('spaces=appDataFolder')).length, 1, 'the file is looked up once');
  });

  it('asks the player to sign in when there is no token or Google refuses it', async () => {
    const none = createDriveProvider({ getToken: async () => null, fetch: fake([]).f });
    await assert.rejects(none.read(), SignInRequired);
    const refused = createDriveProvider({ getToken: async () => 'old', fetch: fake([], 401).f });
    await assert.rejects(refused.read(), SignInRequired);
  });

  it('reports other errors as errors', async () => {
    const drive = createDriveProvider({ getToken: async () => 't', fetch: fake([], 500).f });
    await assert.rejects(drive.read(), /500/);
  });
});

describe('syncing the device', () => {
  const { updatedAt: _u, ...content } = snap({ library: [puzzle('a')] });
  void _u;

  it('stamps changes with the time they are noticed, and unchanged data with the old time', async () => {
    const { emptyMeta, runSync, stampLocal, hasUnsyncedChanges } = await import('../../src/sync/run');
    const first = emptyMeta();
    assert.equal(stampLocal(content, first, 500).updatedAt, 500);
    assert.equal(hasUnsyncedChanges(content, first), true);
    const cloud = new Memory();
    const done = await runSync(cloud, content, first, 500);
    assert.equal(done.meta.updatedAt, 500);
    assert.equal(done.meta.lastSyncedAt, 500);
    assert.equal(hasUnsyncedChanges(content, done.meta), false);
    assert.equal(stampLocal(content, done.meta, 9000).updatedAt, 500, 'nothing changed: still the old time');
    const changed = { ...content, joseki: ['a'] };
    assert.equal(stampLocal(changed, done.meta, 9000).updatedAt, 9000);
    assert.equal(hasUnsyncedChanges(changed, done.meta), true);
  });

  it('a damaged cloud file leaves the saved state alone', async () => {
    const { emptyMeta, runSync } = await import('../../src/sync/run');
    const meta = emptyMeta();
    const r = await runSync(new Memory('{ broken'), content, meta, 5);
    assert.equal(r.result.remoteDamaged, true);
    assert.deepEqual(r.meta, meta);
  });

  it("a second device picks up the first one's puzzles and then has nothing left to upload", async () => {
    const { emptyMeta, runSync, hasUnsyncedChanges } = await import('../../src/sync/run');
    const cloud = new Memory();
    await runSync(cloud, content, emptyMeta(), 100);
    const { updatedAt: _t, ...other } = snap({ library: [puzzle('b')] });
    void _t;
    const r = await runSync(cloud, other, emptyMeta(), 200);
    assert.deepEqual(r.result.merged.library.map((p) => p.id).sort(), ['a', 'b']);
    assert.equal(r.result.changedLocal, true);
    const { updatedAt: _m, ...mergedContent } = r.result.merged;
    void _m;
    assert.equal(hasUnsyncedChanges(mergedContent, r.meta), false);
  });
});

describe('connecting a device that has never synced', () => {
  const learning = (spaced: string[], learningIds: string[]) => ({
    ...snap().learning,
    spaced: Object.fromEntries(spaced.map((id) => [id, true as const])),
    learning: Object.fromEntries(learningIds.map((id) => [id, true as const])),
  });

  it("keeps the cloud's study lists, joseki list and settings, and adds the device's puzzles to them", async () => {
    const { emptyMeta, runSync } = await import('../../src/sync/run');
    const cloud = new Memory();
    await cloud.write(
      stringifySnapshot(
        snap({
          updatedAt: 100,
          library: [puzzle('old')],
          joseki: ['old'],
          learning: learning(['old'], ['old']),
          settings: { ...SETTINGS, paper: 'on' },
        }),
      ),
    );
    // a new device: a bunch of puzzles added, nothing else set up
    const local = snap({ library: [puzzle('n1'), puzzle('n2')], joseki: ['n1'], learning: learning(['n1'], []) });
    const { updatedAt: _u, ...content } = local;
    void _u;
    const { result } = await runSync(cloud, content, emptyMeta(), 5000);
    const m = result.merged;
    assert.deepEqual(m.library.map((p) => p.id).sort(), ['n1', 'n2', 'old']);
    assert.deepEqual(Object.keys(m.learning.spaced).sort(), ['n1', 'old']);
    assert.deepEqual(Object.keys(m.learning.learning), ['old'], "the cloud's guided learning list is still there");
    assert.deepEqual([...m.joseki].sort(), ['n1', 'old']);
    assert.equal(m.settings.paper, 'on', "the cloud's settings win over a device's defaults");
    assert.deepEqual(parseSnapshot(cloud.text!)!.library.length, 3, 'and the cloud has it all');
  });

  it('a device that has synced before still lets its newer change win, as before', async () => {
    const { runSync } = await import('../../src/sync/run');
    const cloud = new Memory();
    await cloud.write(stringifySnapshot(snap({ updatedAt: 100, joseki: ['a'], learning: learning(['a'], []) })));
    const { updatedAt: _u, ...content } = snap({ joseki: [], learning: learning([], []) });
    void _u;
    const meta = { updatedAt: 50, lastSyncedAt: 50, syncedKey: 'something else' };
    const { result } = await runSync(cloud, content, meta, 5000);
    assert.deepEqual(result.merged.joseki, [], 'removed on this device since the last sync');
    assert.deepEqual(result.merged.learning.spaced, {});
  });

  it('a device that was signed out and signs in again counts as new (its meta is reset)', async () => {
    const { emptyMeta } = await import('../../src/sync/run');
    assert.equal(emptyMeta().syncedKey, null);
  });
});

describe('changes made while a sync is running', () => {
  const content = (over: Partial<Snapshot> = {}) => {
    const { updatedAt: _u, ...c } = snap(over);
    void _u;
    return c;
  };
  const resultOf = (merged: Snapshot, changedLocal: boolean) => ({
    merged,
    uploaded: true,
    changedLocal,
    remoteDamaged: false,
  });

  it('applies the merge as it is when nothing changed meanwhile', async () => {
    const { applyAfterSync } = await import('../../src/sync/run');
    const sent = content({ library: [puzzle('a')] });
    const merged = snap({ updatedAt: 10, library: [puzzle('a'), puzzle('cloud')] });
    assert.equal(applyAfterSync(sent, sent, resultOf(merged, true), 20), merged);
    assert.equal(applyAfterSync(sent, sent, resultOf(merged, false), 20), null, 'nothing to apply');
  });

  it("keeps puzzles added while the sync ran, together with the cloud's", async () => {
    const { applyAfterSync } = await import('../../src/sync/run');
    const sent = content({ library: [puzzle('a')] });
    const current = content({ library: [puzzle('a'), puzzle('typed-meanwhile')] });
    const merged = snap({ updatedAt: 10, library: [puzzle('a'), puzzle('cloud')] });
    const out = applyAfterSync(sent, current, resultOf(merged, true), 20)!;
    assert.deepEqual(out.library.map((p) => p.id).sort(), ['a', 'cloud', 'typed-meanwhile']);
  });

  it('lets what the player did meanwhile win over the cloud for lists', async () => {
    const { applyAfterSync } = await import('../../src/sync/run');
    const sent = content({ joseki: [] });
    const current = content({ joseki: ['x'] });
    const merged = snap({ updatedAt: 10, joseki: [], library: [puzzle('cloud')] });
    const out = applyAfterSync(sent, current, resultOf(merged, true), 20)!;
    assert.deepEqual(out.joseki, ['x']);
  });

  it('applies nothing when the device already holds everything and more', async () => {
    const { applyAfterSync } = await import('../../src/sync/run');
    const sent = content({ library: [puzzle('a')] });
    const current = content({ library: [puzzle('a'), puzzle('b')] });
    assert.equal(applyAfterSync(sent, current, resultOf(snap({ updatedAt: 10 }), false), 20), null);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_RETRIES, SESSION_SIZE, SessionQueue, pickSessionIds, shuffle } from '../../src/study/session';
import { seeded } from '../lib/helpers';

describe('spaced repetition sessions', () => {
  it('shows each puzzle once, in order, then finishes', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    const seen: string[] = [];
    while (!q.done) {
      seen.push(q.current!);
      q.complete(true);
      q.next();
    }
    assert.deepEqual(seen, ['a', 'b', 'c']);
    assert.equal(q.current, null);
    assert.equal(q.total, 3);
  });

  it('brings a puzzle back once at the end if it was not solved cleanly', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    const seen: string[] = [];
    while (!q.done) {
      seen.push(q.current!);
      q.complete(q.current !== 'b' || seen.filter((x) => x === 'b').length > 1); // b fails once, then succeeds
      q.next();
    }
    assert.deepEqual(seen, ['a', 'b', 'c', 'b']);
    assert.equal(q.total, 4, 'the session grew by the retry');
  });

  it('retries a puzzle at most MAX_RETRIES times, so the session always ends', () => {
    assert.equal(MAX_RETRIES, 1);
    const q = new SessionQueue(['a']);
    let showings = 0;
    while (!q.done) {
      assert.ok(showings++ < 10, 'did not end');
      q.complete(false);
      q.next();
    }
    assert.equal(showings, 2, 'shown once, retried once');
  });

  it('counts each puzzle once, by how its first showing went', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    const outcome: Record<string, boolean[]> = { a: [true], b: [false, true], c: [false, false] };
    while (!q.done) {
      q.complete(outcome[q.current!].shift()!);
      q.next();
    }
    assert.deepEqual(q.stats(), { reviewed: 3, firstTry: 1, missed: 2, skipped: 0, retriesCleared: 1 });
  });

  it('only records a puzzle once, however often the result arrives', () => {
    const q = new SessionQueue(['a', 'b']);
    q.complete(false);
    q.complete(false);
    q.complete(true);
    assert.equal(q.results.length, 1);
    assert.equal(q.total, 3, 'only one retry was queued');
    assert.equal(q.isAnswered, true);
    q.next();
    assert.equal(q.isAnswered, false);
  });

  it('can skip a puzzle without recording or retrying it', () => {
    const q = new SessionQueue(['a', 'b']);
    q.skip();
    assert.equal(q.total, 2);
    q.next();
    q.complete(true);
    q.next();
    assert.ok(q.done);
    assert.deepEqual(q.stats(), { reviewed: 1, firstTry: 1, missed: 0, skipped: 1, retriesCleared: 0 });
  });

  it('tracks the position, and finish() ends it early keeping the results', () => {
    const q = new SessionQueue(['a', 'b', 'c']);
    assert.deepEqual([q.position, q.total], [1, 3]);
    q.complete(true);
    q.next();
    assert.equal(q.position, 2);
    q.finish();
    assert.ok(q.done);
    assert.equal(q.results.length, 1);
    q.next();
    q.complete(true);
    assert.equal(q.results.length, 1, 'nothing more happens after the end');
  });

  it('handles an empty session', () => {
    const q = new SessionQueue([]);
    assert.ok(q.done);
    assert.equal(q.current, null);
    assert.deepEqual(q.stats(), { reviewed: 0, firstTry: 0, missed: 0, skipped: 0, retriesCleared: 0 });
  });

  it('shuffles without losing or duplicating anything, deterministically per seed', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const a = shuffle(ids, seeded(1));
    assert.deepEqual([...a].sort(), [...ids].sort());
    assert.deepEqual(shuffle(ids, seeded(1)), a);
    assert.notDeepEqual(shuffle(ids, seeded(2)), a);
    assert.deepEqual(
      ids,
      Array.from({ length: 30 }, (_, i) => `p${i}`),
      'the input is not changed',
    );
  });

  it('picks at most SESSION_SIZE due puzzles', () => {
    const due = Array.from({ length: 55 }, (_, i) => `p${i}`);
    assert.equal(SESSION_SIZE, 20);
    const ids = pickSessionIds(due, seeded(3));
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    assert.ok(ids.every((id) => due.includes(id)));
    assert.equal(pickSessionIds(['x', 'y'], seeded(3)).length, 2);
    assert.deepEqual(pickSessionIds([]), []);
    assert.equal(pickSessionIds(due, seeded(3), 5).length, 5);
  });
});

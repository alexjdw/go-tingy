import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BATCH_SIZE, moreLabel, nextCount, remaining, visibleCount } from '../src/ui/batch';

describe('tile batches', () => {
  it('are 10 at a time', () => {
    assert.equal(BATCH_SIZE, 10);
  });

  it('load another 10 each time, never past the end', () => {
    let shown = BATCH_SIZE;
    const steps = [shown];
    for (let i = 0; i < 6; i++) steps.push((shown = nextCount(shown, 39)));
    assert.deepEqual(steps, [10, 20, 30, 39, 39, 39, 39], 'the last batch is the 9 that remain, then nothing more');
  });

  it('handle lists that are shorter than a batch, exactly a batch, or one over', () => {
    assert.equal(nextCount(10, 3), 3);
    assert.equal(remaining(10, 3), 0);
    assert.equal(remaining(10, 10), 0);
    assert.equal(remaining(10, 11), 1);
    assert.equal(nextCount(10, 11), 11);
    assert.equal(remaining(nextCount(10, 11), 11), 0);
  });

  it('show only what exists, even if the list shrank after more were loaded', () => {
    assert.equal(visibleCount(30, 12), 12);
    assert.equal(remaining(30, 12), 0);
    assert.equal(visibleCount(10, 0), 0);
    assert.equal(visibleCount(0, 25), 0);
    assert.equal(nextCount(30, 12), 12);
  });

  it('are safe with an empty list and with nonsense counts', () => {
    assert.equal(nextCount(10, 0), 0);
    assert.equal(remaining(10, 0), 0);
    assert.equal(nextCount(-5, 25), 10);
    assert.equal(visibleCount(-5, 25), 0);
    assert.equal(remaining(10, -3), 0);
  });

  it('count what is left correctly at every step', () => {
    const total = 39;
    let shown = BATCH_SIZE;
    const left: number[] = [];
    while (remaining(shown, total) > 0) {
      left.push(remaining(shown, total));
      shown = nextCount(shown, total);
    }
    assert.deepEqual(left, [29, 19, 9]);
  });

  it('label the button with how many it will add', () => {
    assert.equal(moreLabel(29), 'Show 10 more');
    assert.equal(moreLabel(10), 'Show 10 more');
    assert.equal(moreLabel(9), 'Show 9 more');
    assert.equal(moreLabel(1), 'Show 1 more');
  });
});

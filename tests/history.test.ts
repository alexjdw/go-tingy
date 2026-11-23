import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { depthOf, toDepth, type Nav } from '../src/nav/history';

const nav = (stack: string[], forward: string[] = []): Nav<string> => ({ stack, forward });

describe('browser history for the navigation stack', () => {
  it('Back goes to the earlier screen and remembers the ones it left', () => {
    assert.deepEqual(toDepth(nav(['home', 'browse', 'study']), 2), nav(['home', 'browse'], ['study']));
    assert.deepEqual(toDepth(nav(['home', 'browse', 'study']), 1), nav(['home'], ['browse', 'study']));
  });

  it('Forward returns to them in order', () => {
    const back = toDepth(nav(['home', 'browse', 'study']), 1);
    const one = toDepth(back, 2);
    assert.deepEqual(one, nav(['home', 'browse'], ['study']));
    assert.deepEqual(toDepth(one, 3), nav(['home', 'browse', 'study']));
  });

  it('a jump of several entries works both ways', () => {
    assert.deepEqual(toDepth(nav(['a', 'b', 'c', 'd']), 1), nav(['a'], ['b', 'c', 'd']));
    assert.deepEqual(toDepth(nav(['a'], ['b', 'c', 'd']), 4), nav(['a', 'b', 'c', 'd']));
  });

  it('never goes past what exists, and never below the first screen', () => {
    assert.deepEqual(toDepth(nav(['a', 'b']), 5), nav(['a', 'b']));
    assert.deepEqual(toDepth(nav(['a', 'b']), 0), nav(['a'], ['b']));
    assert.deepEqual(toDepth(nav(['a'], ['b']), 9), nav(['a', 'b']));
  });

  it('reads the depth from a history state', () => {
    assert.equal(depthOf({ depth: 3 }), 3);
    assert.equal(depthOf(null), 1);
    assert.equal(depthOf({ depth: 'x' }), 1);
  });
});

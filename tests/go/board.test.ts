import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Board } from '../../src/go/board';

describe('board rules', () => {
  it('suicide is illegal, but a capture beats suicide', () => {
    // suicide / capture-beats-suicide
    const b = new Board(5).withStone({ x: 1, y: 0 }, 'B').withStone({ x: 0, y: 1 }, 'B');
    assert.equal(b.play({ x: 0, y: 0 }, 'W'), null, 'suicide illegal');
    const c = new Board(5).withStone({ x: 1, y: 0 }, 'B').withStone({ x: 0, y: 1 }, 'W').withStone({ x: 1, y: 1 }, 'B');
    assert.ok(c.play({ x: 0, y: 0 }, 'B'));
  });
});

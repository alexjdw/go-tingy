import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSkill, type Attempt } from '../../src/progress/skill';

describe('skill level from attempts', () => {
  it('new, red, yellow and gold', () => {
    // skill
    const mk = (correct: boolean, ms: number): Attempt => ({ correct, ms, parMs: 10000, at: 0 });
    assert.equal(computeSkill([]).level, 'new');
    assert.equal(computeSkill([mk(false, 5000), mk(false, 5000)]).level, 'red');
    assert.equal(computeSkill(Array(6).fill(mk(true, 8000))).level, 'gold');
    assert.equal(computeSkill(Array(6).fill(mk(true, 60000))).level, 'yellow');
  });
});

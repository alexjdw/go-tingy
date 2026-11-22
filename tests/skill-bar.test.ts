import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DIAMOND_ABOVE,
  emptyMasteryState,
  guidedStages,
  masteryProgress,
  recordGuidedResult,
  recordMasteryResult,
} from '../src/progress/mastery';
import { barColor } from '../src/progress/skill';

const L = 6; // learner moves: guided stages 5, 4, 3, ... 0 in steps of 2
const result = (score: number) => ({
  score,
  level: 'green' as const,
  moves: 10,
  mistakes: 0,
  ms: 1000,
  lines: 1,
  at: 0,
});

describe('the mastery progress bar', () => {
  it('is empty before any run', () => {
    assert.equal(masteryProgress(emptyMasteryState(), 'p', L).fill, 0);
  });

  it('fills up through the guided stages, to half when they are cleared', () => {
    let s = emptyMasteryState();
    const fills = [masteryProgress(s, 'p', L).fill];
    for (let i = 0; i < guidedStages(L).length; i++) {
      s = recordGuidedResult(s, 'p', L, true);
      fills.push(masteryProgress(s, 'p', L).fill);
    }
    for (let i = 1; i < fills.length; i++) assert.ok(fills[i] > fills[i - 1], `step ${i}`);
    assert.equal(fills[fills.length - 1], 0.5);
  });

  it('a run with a mistake changes nothing', () => {
    const s = recordGuidedResult(emptyMasteryState(), 'p', L, false);
    assert.equal(masteryProgress(s, 'p', L).fill, 0);
  });

  it('then fills with the best mastery score, and is full at diamond', () => {
    let s = emptyMasteryState();
    for (let i = 0; i < guidedStages(L).length; i++) s = recordGuidedResult(s, 'p', L, true);
    const at = (score: number) => masteryProgress(recordMasteryResult(s, 'p', result(score)), 'p', L).fill;
    assert.ok(at(5) > 0.5 && at(10) > at(5) && at(DIAMOND_ABOVE) === 1);
    assert.equal(at(100), 1, 'never past full');
  });

  it('moves from red through yellow and green to gold', () => {
    assert.equal(barColor(0), '#e5484d');
    assert.equal(barColor(0.3), '#f5c518');
    assert.equal(barColor(0.6), '#30a46c');
    assert.equal(barColor(1), '#e5a50a');
    assert.notEqual(barColor(0.15), barColor(0.3), 'blends between the stops');
    assert.equal(barColor(-1), barColor(0));
    assert.equal(barColor(5), barColor(1));
  });
});

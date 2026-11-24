import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyLearningState, recordGuidedResult, recordTimedResult, setCategory } from '../../src/progress/learning';
import { dueText, tileStats } from '../../src/progress/stats';
import type { Attempt } from '../../src/progress/skill';

const DAY = 86_400_000;
const at = (correct: boolean, when: number): Attempt => ({ correct, ms: 1000, parMs: 1000, at: when });
const rows = (s: ReturnType<typeof tileStats>, title: string) =>
  Object.fromEntries(s.find((x) => x.title === title)!.rows.map((r) => [r.label, r.value]));

describe('tile stats', () => {
  const base = { id: 'p', history: undefined, learnerMoves: 6, joseki: false, day: '2026-11-22', now: 10 * DAY };

  it('cover every mode, even for a puzzle that is in none of them', () => {
    const s = tileStats({ ...base, learning: emptyLearningState() });
    assert.deepEqual(
      s.map((x) => x.title),
      ['Spaced repetition', 'Guided learning', 'Joseki mode'],
    );
    assert.equal(rows(s, 'Spaced repetition').Status, 'Not added');
    assert.equal(rows(s, 'Guided learning').Status, 'Not added');
    assert.equal(rows(s, 'Joseki mode')['Both sides'], 'Off');
  });

  it('show the review history for spaced repetition', () => {
    let m = setCategory(emptyLearningState(), 'spaced', 'p', true);
    const history = [at(true, 9 * DAY), at(true, 9.5 * DAY), at(false, 9.9 * DAY)];
    const r = rows(tileStats({ ...base, history, learning: m }), 'Spaced repetition');
    assert.equal(r.Status, 'In your reviews');
    assert.match(r['Right first time'], /67% of 3 tries/);
    assert.ok(r.Level && r['Next review']);
    m = emptyLearningState();
    assert.equal(rows(tileStats({ ...base, learning: m }), 'Spaced repetition').Reviews, 'None yet');
  });

  it('show guided stage, best run and attempts left for learning', () => {
    let m = setCategory(emptyLearningState(), 'learning', 'p', true);
    let r = rows(tileStats({ ...base, learning: m }), 'Guided learning');
    assert.match(r.Guided, /^Stage 1 of \d+ \(5 free moves\)$/);
    assert.equal(r['Best run'], 'None yet');
    assert.equal(r.Today, '2 of 2 attempts left');
    for (let i = 0; i < 10; i++) m = recordGuidedResult(m, 'p', 6, true);
    m = recordTimedResult(m, 'p', { score: 12.34, level: 'gold', moves: 9, mistakes: 0, ms: 1, lines: 1, at: 0 });
    r = rows(tileStats({ ...base, learning: m }), 'Guided learning');
    assert.equal(r.Guided, 'Cleared');
    assert.equal(r['Best run'], '12.3 · Gold');
    assert.equal(r.Runs, '1');
  });

  it('show joseki mode', () => {
    const s = tileStats({ ...base, joseki: true, learning: emptyLearningState() });
    assert.equal(rows(s, 'Joseki mode')['Both sides'], 'On');
  });

  it('say when a review is due', () => {
    assert.equal(dueText(undefined), 'Not started');
    assert.equal(dueText([at(false, 0)], 5 * DAY), 'Due now');
    assert.equal(dueText([at(true, 9.5 * DAY)], 10 * DAY), 'Tomorrow');
    assert.equal(dueText([at(true, 0)], 10 * DAY), 'Due now');
  });
});

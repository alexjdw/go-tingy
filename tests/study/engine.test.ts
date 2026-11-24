import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../../src/study/engine';
import { SAMPLES } from '../../src/data/samples';
import { JOSEKI_DEMO } from '../fixtures/joseki-demo';

describe('study engine: basic play', () => {
  it('captures a stone and solves, counting a wrong move as a mistake', () => {
    // capture
    const e = new StudyEngine(SAMPLES[0].sgf, 'unguided');
    assert.equal(e.play({ x: 5, y: 5 }), 'wrong');
    assert.equal(e.mistakes, 1);
    assert.equal(e.play({ x: 0, y: 2 }), 'solved');
    assert.equal(e.snap.board.get({ x: 0, y: 1 }), null, 'stone captured');
    assert.equal(e.attempt(1000).correct, false);
  });

  it('solves a two-stone capture', () => {
    // two-stone capture
    const e2 = new StudyEngine(SAMPLES[1].sgf, 'unguided');
    assert.equal(e2.play({ x: 0, y: 3 }), 'solved');
  });

  it('joseki book: the learner is White and the opponent replies from the book', () => {
    // joseki: learner is W, opponent replies from book
    const j = new StudyEngine(JOSEKI_DEMO, 'guided', { rng: () => 0 });
    assert.equal(j.playerColor, 'W');
    assert.equal(j.play({ x: 2, y: 2 }), 'ok');
    assert.equal(j.snap.toPlay, 'W');
    assert.equal(j.bookMoves().length, 2);
    j.undo();
    assert.equal(j.snap.node, j.root);
  });

  it('explore leaves the book without complaint', () => {
    // explore leaves book
    const x = new StudyEngine(JOSEKI_DEMO, 'explore');
    x.play({ x: 2, y: 2 });
    x.play({ x: 10, y: 10 });
    assert.equal(x.snap.node, null);
  });
});

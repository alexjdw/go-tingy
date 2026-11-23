import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../src/study/engine';
import { pt } from './helpers';

const PUZZLE = '(;GM[1]SZ[19];B[pd];W[qf];B[qc];W[rc];B[sd];W[se])';

describe('following the given moves (guided learning)', () => {
  it('waits for you to click each given move, for both colors, on the green dot', () => {
    const e = new StudyEngine(PUZZLE, 'unguided', { freeMoves: 2, follow: true });
    assert.equal(e.phase, 'follow');
    assert.deepEqual(e.followHint(), pt('pd'));
    assert.equal(e.follow(pt('pd')), 'ok');
    assert.equal(e.snap.board.get(pt('pd')), 'B');
    assert.deepEqual(e.followHint(), pt('qf'), 'then White’s reply, also clicked by you');
    assert.equal(e.follow(pt('qf')), 'ok');
    assert.equal(e.snap.board.get(pt('qf')), 'W');
    assert.deepEqual(e.followHint(), pt('qc'));
    assert.equal(e.follow(pt('qc')), 'ok');
    assert.deepEqual(e.followHint(), pt('rc'));
  });

  it('ignores clicks off the dot, with no mistake', () => {
    const e = new StudyEngine(PUZZLE, 'unguided', { freeMoves: 2, follow: true });
    assert.equal(e.follow(pt('aa')), 'wrong');
    assert.equal(e.mistakes, 0);
    assert.equal(e.snap.board.get(pt('aa')), null);
    assert.deepEqual(e.followHint(), pt('pd'));
  });

  it('hands over to normal solving when the given moves are used up', () => {
    const e = new StudyEngine(PUZZLE, 'unguided', { freeMoves: 2, follow: true });
    e.follow(pt('pd'));
    e.follow(pt('qf'));
    e.follow(pt('qc'));
    assert.equal(e.phase, 'follow');
    e.follow(pt('rc'));
    assert.equal(e.phase, 'play');
    assert.equal(e.followHint(), null);
    assert.equal(e.play(pt('sd')), 'solved');
  });

  it('is a plain replay without the option', () => {
    const e = new StudyEngine(PUZZLE, 'unguided', { freeMoves: 2 });
    assert.equal(e.phase, 'replay');
    assert.equal(e.followHint(), null);
    assert.equal(e.follow(pt('pd')), 'wrong');
  });
});

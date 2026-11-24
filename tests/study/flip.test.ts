import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine, chooseFlip } from '../../src/study/engine';
import { SAMPLES } from '../../src/data/samples';
import { flipColors, parseSgf } from '../../src/sgf/parser';

describe('color flipping', () => {
  it('flipColors swaps colors in the SGF, including words in comments', () => {
    // colour flipping (incl. comment words)
    const f = parseSgf(SAMPLES[0].sgf);
    flipColors(f);
    assert.deepEqual(f.props.PL, ['W']);
    assert.deepEqual(f.props.AW, ['aa', 'bb']);
    assert.match(f.props.C[0], /White to play/);
    const fe = new StudyEngine(SAMPLES[0].sgf, 'unguided', { flipColors: 'on' });
    assert.equal(fe.playerColor, 'W');
    assert.equal(fe.play({ x: 0, y: 2 }), 'solved');
    assert.equal(
      new StudyEngine(SAMPLES[0].sgf, 'explore', { flipColors: 'on' }).playerColor,
      'B',
      'no flip in explore',
    );
  });

  it('the flip is chosen once: a reset keeps it, and explore shows the same colors', () => {
    // the flip is chosen once: a reset keeps it, and a given flip applies in every mode, explore included
    let roll = 0.1;
    const rolled = new StudyEngine(SAMPLES[0].sgf, 'unguided', { flipColors: 'random', rng: () => roll });
    assert.equal(rolled.flipped, true);
    roll = 0.9;
    rolled.reset();
    assert.equal(rolled.flipped, true, 'a new random draw does not undo the flip');
    const calm = new StudyEngine(SAMPLES[0].sgf, 'unguided', { flipColors: 'random', rng: () => 0.9 });
    roll = 0.1;
    calm.reset();
    assert.equal(calm.flipped, false);
    const seen = new StudyEngine(SAMPLES[0].sgf, 'explore', { flipColors: 'random', flipped: true });
    assert.equal(seen.flipped, true);
    assert.equal(seen.snap.board.get({ x: 0, y: 0 }), 'W', 'explore shows the same flipped colors as solving');
    assert.equal(chooseFlip('on'), true);
    assert.equal(chooseFlip('off'), false);
    assert.equal(
      chooseFlip('random', () => 0.2),
      true,
    );
    assert.equal(
      chooseFlip('random', () => 0.7),
      false,
    );
  });
});

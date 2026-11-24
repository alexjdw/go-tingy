import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../../src/study/engine';
import { SAMPLES } from '../../src/data/samples';

describe('choice modes', () => {
  it('multiple choice: only lettered points are tappable in unguided mode', () => {
    // multiple choice (A/B/C labels): only lettered points tappable in unguided mode
    const mc = `(;SZ[19]PL[B]AB[aa]AW[ab]LB[cc:A][dd:B][ee:C]
    (;B[cc]TE[1])(;B[dd]BM[1])(;B[ee]BM[1]))`;
    const m1 = new StudyEngine(mc, 'unguided');
    assert.equal(m1.choicePoints().length, 3);
    assert.equal(m1.play({ x: 9, y: 9 }), 'illegal');
    assert.equal(m1.mistakes, 0, 'unlettered tap is ignored, not a mistake');
    assert.equal(m1.play({ x: 3, y: 3 }), 'wrong');
    assert.equal(m1.play({ x: 2, y: 2 }), 'solved');
    assert.equal(new StudyEngine(mc, 'guided').play({ x: 9, y: 9 }), 'wrong', 'guided is unrestricted');
  });

  it('mark-the-choices phase at the root', () => {
    // mark-the-choices phase at the root
    const mk2 = `(;SZ[19]PL[B]AB[aa]AW[ab]
    (;B[cc]TE[1])(;B[dd];W[ee];B[ff]C[Correct])(;B[gg]BM[1])(;B[hh]C[hmm]))`;
    const k = new StudyEngine(mk2, 'unguided', { markChoices: 'on' });
    assert.equal(k.phase, 'mark');
    assert.equal(k.play({ x: 2, y: 2 }), 'illegal', 'cannot play during mark phase');
    k.toggleMark({ x: 2, y: 2 });
    assert.equal(k.submitMarks(), 'wrong', 'dd missing');
    k.toggleMark({ x: 3, y: 3 });
    k.toggleMark({ x: 6, y: 6 }); // gg is wrong
    assert.equal(k.submitMarks(), 'wrong');
    k.toggleMark({ x: 6, y: 6 });
    assert.equal(k.submitMarks(), 'ok');
    assert.equal(k.phase, 'play');
    assert.equal(k.mistakes, 2);
    assert.equal(k.play({ x: 2, y: 2 }), 'solved');
    assert.equal(new StudyEngine(mk2, 'unguided', { markChoices: 'off' }).phase, 'play');
    assert.equal(new StudyEngine(mk2, 'guided', { markChoices: 'on' }).phase, 'play', 'only unguided');
    assert.equal(new StudyEngine(SAMPLES[0].sgf, 'unguided', { markChoices: 'on' }).phase, 'play', 'no branch point');
  });

  it('replays up to a deeper branching point before marking', () => {
    // replay up to a deeper branching point
    const deep = `(;SZ[19]PL[B]AB[aa]AW[ab]
    (;B[cc];W[dd](;B[ee]TE[1])(;B[ff]TE[1])(;B[gg]BM[1])))`;
    const d = new StudyEngine(deep, 'unguided', { markChoices: 'on' });
    assert.equal(d.phase, 'replay');
    d.replayStep();
    assert.equal(d.phase, 'replay');
    d.replayStep();
    assert.equal(d.phase, 'mark');
    assert.equal(d.snap.toPlay, 'B');
    d.toggleMark({ x: 4, y: 4 });
    d.toggleMark({ x: 5, y: 5 });
    assert.equal(d.submitMarks(), 'ok');
    assert.equal(d.play({ x: 4, y: 4 }), 'solved');
  });
});

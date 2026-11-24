import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../../src/study/engine';
import { SAMPLES } from '../../src/data/samples';
import { prepareSgf } from '../../src/sgf/normalize';
import { splitCollection } from '../../src/sgf/parser';
import { validateSgf } from '../../src/sgf/validate';

describe('normalizing imported SGF', () => {
  it('FF[3] style: setup in the second node, PL[2], triangle on a move = wrong', () => {
    // real-world collections: preamble text with parentheses is not a puzzle
    const coll = [
      'Intro text (see http://example.org/) here.',
      '(;SZ[19];AW[pb][qb]AB[ob]PL[2](;W[sa])(;W[sb]TR[sb]))',
      '(;SZ[19]AB[aa];B[bb])',
    ].join('\n');
    assert.equal(splitCollection(coll).length, 2);
    // FF[3]-style: setup in 2nd node, PL[2], triangle-on-move = wrong
    const old = splitCollection(coll)[0];
    assert.ok(validateSgf(old).errors.length, 'unnormalized is rejected');
    const prep = prepareSgf(old);
    assert.equal(prep.notes.length, 2);
    assert.deepEqual(validateSgf(prep.sgf).errors, []);
    const oe = new StudyEngine(prep.sgf, 'unguided');
    assert.equal(oe.playerColor, 'W');
    assert.equal(oe.play({ x: 18, y: 1 }), 'wrong', 'triangle branch is wrong');
    assert.equal(oe.play({ x: 18, y: 0 }), 'solved');
    assert.equal(prepareSgf(SAMPLES[0].sgf).sgf, SAMPLES[0].sgf, 'untouched when nothing to fix');
  });

  it('passes written zz / ZZ become real passes, and the puzzle then validates', () => {
    // passes written as zz / ZZ (Chinese collections) become real passes, and the puzzle then validates
    const zz = prepareSgf('(;GM[1]SZ[19]PL[B]AB[pd]AW[qd];B[qc];W[zz];B[ZZ];W[pc])');
    assert.ok(zz.sgf.includes('W[];B[]'), zz.sgf);
    assert.ok(zz.notes.some((n) => /2 passes/.test(n)));
    assert.deepEqual(validateSgf(zz.sgf).errors, []);
    assert.ok(validateSgf(zz.sgf).warnings.includes('Contains passes'));
    assert.equal(prepareSgf('(;GM[1]SZ[19];B[aa];W[bb])').notes.length, 0, 'ordinary moves are left alone');
  });

  it('an empty node between the root and the setup is tolerated', () => {
    // empty node between root and setup
    assert.deepEqual(validateSgf(prepareSgf('(;GM[1]SZ[9];;AB[aa]PL[B];B[bb])').sgf).errors, []);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLES } from '../../src/data/samples';
import { validateSgf } from '../../src/sgf/validate';

describe('SGF validation', () => {
  it('accepts the built-in samples and reports each kind of error', () => {
    for (const sm of SAMPLES) assert.deepEqual(validateSgf(sm.sgf).errors, [], sm.title);
    assert.ok(validateSgf('not sgf').errors.length);
    assert.ok(validateSgf('(;SZ[19]AB[aa]AW[aa];B[bb])').errors[0].includes('overlap'));
    assert.ok(validateSgf('(;SZ[9];B[jj])').errors[0].includes('outside'));
    assert.ok(validateSgf('(;SZ[9];B[aa];W[aa])').errors[0].includes('Illegal'));
    assert.ok(validateSgf('(;SZ[9]AB[ba][ab];W[aa])').errors[0].includes('Illegal'), 'suicide');
    assert.ok(validateSgf('(;SZ[9]AB[aa])').errors[0].includes('no moves'));
    assert.ok(validateSgf('(;SZ[abc];B[aa])').errors[0].includes('board size'));
    assert.ok(validateSgf('(;SZ[9];B[aa])').warnings.some((w) => w.includes('marked')));
    assert.equal(validateSgf('(;SZ[9]GN[Hi];B[aa]TE[1])').title, 'Hi');
  });
});

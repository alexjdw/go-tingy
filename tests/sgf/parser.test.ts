import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLES } from '../../src/data/samples';
import { parseSgf, splitCollection, toSgf } from '../../src/sgf/parser';

describe('SGF parser', () => {
  it('serialization round trip', () => {
    // serialization round trip
    for (const s of SAMPLES) {
      const once = toSgf(parseSgf(s.sgf));
      assert.equal(toSgf(parseSgf(once)), once);
    }
    assert.equal(toSgf(parseSgf('(;C[a\\]b\\\\c];B[aa])')), '(;C[a\\]b\\\\c];B[aa])');
  });

  it('splits a collection into games, ignoring parentheses inside values and preamble text', () => {
    // collections & validation
    assert.equal(splitCollection('junk (;B[aa]) (;W[bb](;B[cc])(;B[dd]))  ').length, 2);
    assert.equal(splitCollection('(;C[a)b(c];B[aa])').length, 1, 'parens inside values ignored');
    assert.equal(splitCollection('').length, 0);
    assert.equal(splitCollection('not sgf').length, 1);
  });

  it('reads properties written after the variations of a node (MultiGo, as Sabaki does)', () => {
    // properties written after a node's variations belong to that node (MultiGo files, read the same way by Sabaki)
    const late = parseSgf('(;B[aa](;W[bb])LB[cc:a]C[note](;W[dd]))');
    assert.equal(late.children.length, 2);
    assert.deepEqual(late.props.C, ['note']);
    assert.deepEqual(late.props.LB, ['cc:a']);
    assert.equal(late.children[0].props.C, undefined, 'the variation itself is untouched');
  });

  it('is lenient: empty variations and a missing final parenthesis', () => {
    // lenient like Sabaki: empty variations "()" are ignored and a missing final ")" is forgiven
    const sloppy = parseSgf('(;B[aa](;W[bb])()(;W[cc]');
    assert.equal(sloppy.children.length, 2);
    assert.equal(sloppy.children[1].props.W[0], 'cc');
    assert.throws(() => parseSgf('()'), /empty game tree/);
  });

  it('parse errors show about 10 characters of text near the problem', () => {
    // parse errors show about 10 characters of the text around the problem
    const msg = (t: string) => {
      try {
        parseSgf(t);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };
    assert.equal(msg('(;B[aa] ? ;W[bb];B[cc])'), 'SGF: unexpected "?" at 8 near "a] ? ;W[bb"');
    assert.equal(msg('(;B[aa];W[bb'), 'SGF: unterminated value near "B[aa];W[bb"');
    assert.equal(msg('('), 'SGF: unexpected end of input near "("');
    assert.equal(msg('hello world, no tree'), 'SGF: no game tree found near "hello worl"');
    assert.match(msg('()'), /^SGF: empty game tree near "\(\)"$/);
    assert.match(msg('(;B[aa]\n\n\n;W[bb] #)'), /near ";W\[bb\] #\)"/, 'line breaks collapse to one space');
  });
});

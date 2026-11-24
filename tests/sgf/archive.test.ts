import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gzipSync, zipSync, strToU8 } from 'fflate';
import { expandFile, baseName } from '../../src/sgf/archive';

describe('archives', () => {
  it('gzip and zip are unpacked by their magic bytes', () => {
    // archives: gzip and zip are unpacked by magic bytes
    const one = strToU8('(;SZ[9];B[aa])');
    assert.equal(new TextDecoder().decode(expandFile('a.sgf.gz', gzipSync(one))[0].bytes), '(;SZ[9];B[aa])');
    assert.equal(expandFile('a.sgf.gz', gzipSync(one))[0].name, 'a.sgf');
    const z = expandFile(
      'pack.zip',
      zipSync({ 'dir/b.sgf': one, 'c.sgf': one, 'readme.md': one, '__MACOSX/._b.sgf': one }),
    );
    assert.deepEqual(
      z.map((f) => f.name),
      ['c.sgf', 'dir/b.sgf'],
    );
    assert.equal(expandFile('plain.sgf', one).length, 1);
    assert.throws(() => expandFile('x.zip', zipSync({ 'b.png': one })), /No .sgf/);
    assert.equal(baseName('dir/xxqj.sgf.gz'), 'xxqj');
  });
});
